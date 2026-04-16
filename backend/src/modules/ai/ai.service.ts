import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import { ChatDto } from './dto/chat.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private genAI: GoogleGenerativeAI;
  private model: string;
  private openai: OpenAI | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.genAI = new GoogleGenerativeAI(this.config.get<string>('GEMINI_API_KEY')!);
    this.model = this.config.get<string>('GEMINI_MODEL', 'gemini-2.0-flash');
    const openaiKey = this.config.get<string>('OPENAI_API_KEY');
    if (openaiKey) this.openai = new OpenAI({ apiKey: openaiKey });
  }

  // ================================================================
  // PRIVATE — OpenAI fallback helper
  // ================================================================

  private async callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.openai) throw new Error('OpenAI não configurada');
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2048,
    });
    return completion.choices[0]?.message?.content || '';
  }

  // ================================================================
  // CHAT — Client / Operator / Admin
  // ================================================================

  async chat(userId: string, userRole: string, dto: ChatDto) {
    const startTime = Date.now();

    const systemPrompt = this.getSystemPrompt(userRole);
    const contextData = await this.getUserContext(userId, userRole);

    const fullPrompt = `
Contexto do usuário:
${contextData}

Pergunta do usuário:
${dto.message}

${dto.context ? `Contexto adicional: ${dto.context}` : ''}
    `.trim();

    let response: string;
    try {
      const model = this.genAI.getGenerativeModel({
        model: this.model,
        systemInstruction: systemPrompt,
      });
      const result = await model.generateContent(fullPrompt);
      response = result.response.text();
    } catch (geminiErr: any) {
      this.logger.warn('Gemini chat falhou, tentando OpenAI...', geminiErr?.message);
      response = await this.callOpenAI(systemPrompt, fullPrompt);
    }

    const durationMs = Date.now() - startTime;

    // Log interaction
    await this.prisma.aiLog.create({
      data: {
        userId,
        role: userRole as any,
        prompt: dto.message,
        response,
        context: dto.context || null,
        tokensUsed: response.length, // Approximation
        costUsd: (response.length / 1000) * 0.0001, // Approximation
        durationMs,
      },
    });

    return {
      message: response,
      durationMs,
    };
  }

  // ================================================================
  // INSIGHTS — Admin Dashboard
  // ================================================================

  async generateInsights(userId: string) {
    const startTime = Date.now();

    const [
      financeSummary,
      reservationStats,
      fuelStats,
      maintenanceStats,
      delinquencyStats,
    ] = await Promise.all([
      this.getFinanceSummary(),
      this.getReservationStats(),
      this.getFuelStats(),
      this.getMaintenanceStats(),
      this.getDelinquencyStats(),
    ]);

    const systemInstruction = `Você é um analista de negócios especializado em gestão de marinas.
Analise os dados fornecidos e gere insights acionáveis em português brasileiro.
Seja direto, objetivo e sugira ações concretas.
Formate com bullet points e seções claras.
Use emojis para facilitar a leitura.`;

    const prompt = `
Analise os seguintes dados da marina Prize Clube e gere insights estratégicos:

📊 FINANCEIRO:
${JSON.stringify(financeSummary, null, 2)}

📅 RESERVAS:
${JSON.stringify(reservationStats, null, 2)}

⛽ COMBUSTÍVEL:
${JSON.stringify(fuelStats, null, 2)}

🔧 MANUTENÇÃO:
${JSON.stringify(maintenanceStats, null, 2)}

⚠️ INADIMPLÊNCIA:
${JSON.stringify(delinquencyStats, null, 2)}

Gere:
1. Resumo executivo
2. Alertas críticos
3. Oportunidades de melhoria
4. Previsões
5. Ações recomendadas
    `.trim();

    let response: string;
    try {
      const model = this.genAI.getGenerativeModel({
        model: this.model,
        systemInstruction,
      });
      const result = await model.generateContent(prompt);
      response = result.response.text();
    } catch (geminiErr: any) {
      this.logger.warn('Gemini insights falhou, tentando OpenAI...', geminiErr?.message);
      response = await this.callOpenAI(systemInstruction, prompt);
    }

    const durationMs = Date.now() - startTime;

    await this.prisma.aiLog.create({
      data: {
        userId,
        role: 'ADMIN',
        prompt: 'generate-insights',
        response,
        tokensUsed: response.length,
        costUsd: (response.length / 1000) * 0.0001,
        durationMs,
      },
    });

    return { insights: response, durationMs, generatedAt: new Date() };
  }

  // ================================================================
  // EXPLAIN CHARGE — Client
  // ================================================================

  async explainCharge(userId: string, chargeId: string) {
    const charge = await this.prisma.charge.findUnique({
      where: { id: chargeId },
      include: { payments: true },
    });

    if (!charge) return { message: 'Cobrança não encontrada' };

    const model = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: `Você é um assistente financeiro da marina Prize Clube.
Explique cobranças de forma clara e amigável em português brasileiro.
Se houver pagamento, mencione. Se estiver atrasada, oriente sobre regularização.`,
    });

    const prompt = `Explique esta cobrança para o cliente:
- Descrição: ${charge.description}
- Valor: R$ ${charge.amount.toFixed(2)}
- Vencimento: ${charge.dueDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
- Status: ${charge.status}
- Categoria: ${charge.category}
- Pagamentos: ${charge.payments.length > 0 ? charge.payments.map(p => `R$ ${p.amount.toFixed(2)} via ${p.method}`).join(', ') : 'Nenhum'}`;

    const result = await model.generateContent(prompt);
    return { explanation: result.response.text() };
  }

  // ================================================================
  // PREDICT DELINQUENCY
  // ================================================================

  async predictDelinquency(userId: string) {
    const userCharges = await this.prisma.charge.findMany({
      where: { userId },
      orderBy: { dueDate: 'desc' },
      take: 20,
    });

    const latePayments = userCharges.filter(c => c.status === 'OVERDUE' || (c.paidAt && c.paidAt > c.dueDate));
    const lateRate = userCharges.length > 0 ? latePayments.length / userCharges.length : 0;

    const model = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: `Você é um analista de risco financeiro para marina.
Baseado no histórico de pagamentos, avalie o risco de inadimplência.
Responda em JSON com: riskLevel (LOW/MEDIUM/HIGH), score (0-100), reason, suggestion.`,
    });

    const prompt = `Analise o histórico:
- Total de cobranças: ${userCharges.length}
- Cobranças atrasadas: ${latePayments.length}
- Taxa de atraso: ${(lateRate * 100).toFixed(1)}%
- Último pagamento: ${userCharges.find(c => c.paidAt)?.paidAt?.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) || 'Nenhum'}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return { riskLevel: lateRate > 0.3 ? 'HIGH' : lateRate > 0.1 ? 'MEDIUM' : 'LOW', raw: text };
    }
  }

  // ================================================================
  // AI USAGE STATS
  // ================================================================

  async getUsageStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalLogs, recentLogs, costByRole] = await Promise.all([
      this.prisma.aiLog.count(),
      this.prisma.aiLog.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.aiLog.groupBy({
        by: ['role'],
        _sum: { costUsd: true, tokensUsed: true },
        _count: true,
      }),
    ]);

    return { totalInteractions: totalLogs, last30Days: recentLogs, byRole: costByRole };
  }

  // ================================================================
  // PRIVATE — System Prompts by Role
  // ================================================================

  private getSystemPrompt(role: string): string {
    const prompts: Record<string, string> = {
      CLIENT: `Você é o assistente virtual da marina Prize Clube.
Ajude os clientes com:
- Informações sobre suas cotas e embarcações
- Status de reservas e fila de descida
- Dúvidas sobre cobranças e pagamentos
- Como fazer reservas
- Regras da marina
Seja amigável, claro e objetivo. Responda sempre em português brasileiro.
Se não souber a resposta, oriente a entrar em contato com a marina.`,

      OPERATOR: `Você é o assistente operacional da marina Prize Clube.
Ajude os operadores com:
- Procedimentos de check-list
- Registro de combustível
- Gestão da fila de descida
- Manutenção de embarcações
- Regras operacionais
- Orientações de segurança
Seja técnico e direto. Responda em português brasileiro.`,

      ADMIN: `Você é o consultor de gestão da marina Prize Clube.
Ajude os administradores com:
- Análise financeira
- Gestão de inadimplência
- Relatórios e métricas
- Decisões estratégicas
- Otimização de operações
- Previsões e tendências
Seja analítico, use dados quando disponível. Responda em português brasileiro.`,
    };

    return prompts[role] || prompts.CLIENT;
  }

  private async getUserContext(userId: string, role: string): Promise<string> {
    if (role === 'CLIENT') {
      const [shares, pendingCharges, nextReservation, queuePosition] = await Promise.all([
        this.prisma.share.count({ where: { userId, isActive: true } }),
        this.prisma.charge.count({ where: { userId, status: { in: ['PENDING', 'OVERDUE'] } } }),
        this.prisma.reservation.findFirst({
          where: { userId, status: 'CONFIRMED', startDate: { gte: new Date() } },
          orderBy: { startDate: 'asc' },
          include: { boat: { select: { name: true } } },
        }),
        this.prisma.operationalQueue.findFirst({
          where: { clientId: userId, status: { in: ['WAITING', 'PREPARING'] } },
        }),
      ]);

      return `Cotas ativas: ${shares}, Cobranças pendentes: ${pendingCharges}, Próxima reserva: ${nextReservation ? `${nextReservation.boat.name} em ${nextReservation.startDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'Nenhuma'}, Na fila: ${queuePosition ? `Sim (posição ${queuePosition.position})` : 'Não'}`;
    }

    if (role === 'ADMIN') {
      const [totalUsers, totalBoats, activeDelinquents, pendingMaintenance] = await Promise.all([
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.boat.count({ where: { deletedAt: null } }),
        this.prisma.delinquency.count({ where: { status: 'ACTIVE' } }),
        this.prisma.maintenance.count({ where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } } }),
      ]);

      return `Usuários ativos: ${totalUsers}, Embarcações: ${totalBoats}, Inadimplentes: ${activeDelinquents}, Manutenções pendentes: ${pendingMaintenance}`;
    }

    return 'Operador da marina';
  }

  private async getFinanceSummary() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [monthRevenue, totalPending, totalOverdue] = await Promise.all([
      this.prisma.payment.aggregate({ where: { paidAt: { gte: startOfMonth } }, _sum: { amount: true } }),
      this.prisma.charge.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true }, _count: true }),
      this.prisma.charge.aggregate({ where: { status: 'OVERDUE' }, _sum: { amount: true }, _count: true }),
    ]);

    return {
      monthRevenue: monthRevenue._sum.amount || 0,
      pendingAmount: totalPending._sum.amount || 0,
      pendingCount: totalPending._count || 0,
      overdueAmount: totalOverdue._sum.amount || 0,
      overdueCount: totalOverdue._count || 0,
    };
  }

  private async getReservationStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [monthTotal, cancelled, occupancyRate] = await Promise.all([
      this.prisma.reservation.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.reservation.count({ where: { status: 'CANCELLED', createdAt: { gte: startOfMonth } } }),
      this.prisma.boat.count({ where: { status: 'IN_USE' } }),
    ]);

    const totalBoats = await this.prisma.boat.count({ where: { deletedAt: null } });

    return {
      monthReservations: monthTotal,
      cancelledThisMonth: cancelled,
      currentOccupancy: totalBoats > 0 ? `${((occupancyRate / totalBoats) * 100).toFixed(0)}%` : '0%',
    };
  }

  private async getFuelStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthFuel = await this.prisma.fuelLog.aggregate({
      where: { loggedAt: { gte: startOfMonth } },
      _sum: { liters: true, totalCost: true },
      _count: true,
    });

    return {
      monthLiters: monthFuel._sum.liters || 0,
      monthCost: monthFuel._sum.totalCost || 0,
      refuelCount: monthFuel._count || 0,
    };
  }

  private async getMaintenanceStats() {
    const [active, completed, critical] = await Promise.all([
      this.prisma.maintenance.count({ where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } } }),
      this.prisma.maintenance.count({ where: { status: 'COMPLETED' } }),
      this.prisma.maintenance.count({ where: { priority: 'CRITICAL', status: { not: 'COMPLETED' } } }),
    ]);

    return { activeMaintenance: active, completedTotal: completed, criticalPending: critical };
  }

  private async getDelinquencyStats() {
    const [active, totalAmount] = await Promise.all([
      this.prisma.delinquency.count({ where: { status: 'ACTIVE' } }),
      this.prisma.delinquency.aggregate({ where: { status: 'ACTIVE' }, _sum: { totalAmount: true } }),
    ]);

    return { activeDelinquents: active, totalDebt: totalAmount._sum.totalAmount || 0 };
  }
}
