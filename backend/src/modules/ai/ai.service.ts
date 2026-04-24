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
    if (openaiKey && openaiKey.startsWith('sk-')) {
      this.openai = new OpenAI({ apiKey: openaiKey, baseURL: 'https://api.openai.com/v1' });
    }
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
  // INSIGHTS — Admin Dashboard (rich KPIs + AI narrative, persisted)
  // ================================================================

  async getLatestInsight() {
    const latest = await this.prisma.aiInsight.findFirst({
      where: { type: 'OPERATIONAL_SUMMARY' },
      orderBy: { createdAt: 'desc' },
    });
    return latest;
  }

  async generateInsights(userId: string) {
    const startTime = Date.now();

    const kpis = await this.computeKpis();

    const systemInstruction = `Você é um analista de negócios sênior, especialista em marinas náuticas.
Responda APENAS com um JSON válido (sem markdown, sem \`\`\`), seguindo o schema fornecido.
Seja direto, prático, use português brasileiro e baseie todas as conclusões nos dados.`;

    const prompt = `Gere uma análise operacional COMPLETA da marina Prize Clube com base nestes KPIs reais:

${JSON.stringify(kpis, null, 2)}

Responda EXATAMENTE neste schema JSON (sem comentários, sem markdown):
{
  "executiveSummary": "2-3 parágrafos analisando a saúde geral da operação, comparando hoje x semana x mês x mês anterior",
  "highlights": ["3-5 destaques positivos curtos"],
  "alerts": [
    {"level": "high|medium|low", "title": "título curto", "description": "o que está acontecendo", "action": "o que fazer"}
  ],
  "suggestions": [
    {"title": "título curto", "description": "sugestão estratégica detalhada", "impact": "high|medium|low"}
  ],
  "trends": {
    "revenue": "análise do trend de receita",
    "reservations": "análise de ocupação e reservas",
    "delinquency": "análise de inadimplência",
    "operations": "análise operacional (combustível, manutenção)"
  },
  "predictions": {
    "monthEndRevenueEstimate": número (estimativa de receita até fim do mês),
    "reasoning": "justificativa da previsão"
  },
  "focusOfWeek": "O foco mais importante para a semana em uma frase"
}

Regras:
- 3 a 6 alertas (priorize inadimplência alta, manutenção crítica, queda de receita, baixa ocupação)
- 3 a 6 sugestões acionáveis
- Use números reais dos KPIs em todas as análises
- Seja específico (cite valores em R$ e %)
- NÃO devolva markdown, SOMENTE o JSON puro`;

    let raw = '';
    let parsed: any = null;
    let provider = 'none';

    // Primary: OpenAI (ChatGPT) — Gemini quota costuma estourar no free tier
    if (this.openai) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 3000,
          temperature: 0.4,
        });
        raw = completion.choices[0]?.message?.content || '';
        parsed = this.tryParseJson(raw);
        if (parsed) provider = 'openai';
      } catch (err: any) {
        this.logger.warn(`OpenAI insights falhou: ${err?.message}`);
      }
    }

    // Fallback: Gemini
    if (!parsed) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: this.model,
          systemInstruction,
          generationConfig: { responseMimeType: 'application/json' as any },
        });
        const result = await model.generateContent(prompt);
        raw = result.response.text();
        parsed = this.tryParseJson(raw);
        if (parsed) provider = 'gemini';
      } catch (err: any) {
        this.logger.warn(`Gemini insights falhou: ${err?.message}`);
      }
    }

    if (!parsed) {
      parsed = this.buildFallbackInsight(kpis);
      provider = 'fallback';
    }

    const data = { kpis, ...parsed };
    const durationMs = Date.now() - startTime;

    const saved = await this.prisma.aiInsight.create({
      data: {
        type: 'OPERATIONAL_SUMMARY',
        data,
        rawResponse: raw || null,
        provider,
        durationMs,
        generatedBy: userId,
      },
    });

    return saved;
  }

  private tryParseJson(text: string): any | null {
    if (!text) return null;
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { return JSON.parse(match[0]); } catch { return null; }
      }
      return null;
    }
  }

  private buildFallbackInsight(k: any) {
    const alerts: any[] = [];
    if (k.delinquency.totalActiveAmount > 0) {
      alerts.push({ level: 'high', title: 'Inadimplência ativa', description: `R$ ${k.delinquency.totalActiveAmount.toFixed(2)} em atraso (${k.delinquency.activeCount} clientes).`, action: 'Disparar régua de cobrança imediata.' });
    }
    if (k.maintenance.criticalPending > 0) {
      alerts.push({ level: 'high', title: 'Manutenção crítica pendente', description: `${k.maintenance.criticalPending} ordens críticas abertas.`, action: 'Priorizar atendimento técnico hoje.' });
    }
    if (k.revenue.monthGrowthPct < 0) {
      alerts.push({ level: 'medium', title: 'Receita do mês caindo', description: `${k.revenue.monthGrowthPct.toFixed(1)}% vs mês anterior.`, action: 'Revisar campanhas e ocupação.' });
    }
    if (alerts.length === 0) alerts.push({ level: 'low', title: 'Operação estável', description: 'Sem alertas críticos no momento.', action: 'Manter monitoramento.' });
    return {
      executiveSummary: `Receita do mês: R$ ${k.revenue.month.toFixed(2)} (vs R$ ${k.revenue.prevMonth.toFixed(2)} anterior, ${k.revenue.monthGrowthPct.toFixed(1)}%). ${k.reservations.month} reservas no mês, ocupação atual ${k.operations.occupancyRatePct.toFixed(0)}%. Inadimplência ativa: R$ ${k.delinquency.totalActiveAmount.toFixed(2)}.`,
      highlights: [
        `Receita hoje: R$ ${k.revenue.today.toFixed(2)}`,
        `Reservas hoje: ${k.reservations.today}`,
        `Ocupação: ${k.operations.occupancyRatePct.toFixed(0)}%`,
      ],
      alerts,
      suggestions: [
        { title: 'Configure GEMINI_API_KEY ou OPENAI_API_KEY válido', description: 'Os insights inteligentes da IA estão indisponíveis (quota Gemini esgotada e/ou OpenAI inválida). Verifique chaves para análise narrativa.', impact: 'high' },
      ],
      trends: {
        revenue: `${k.revenue.monthGrowthPct >= 0 ? 'Crescimento' : 'Queda'} de ${Math.abs(k.revenue.monthGrowthPct).toFixed(1)}% mês vs mês.`,
        reservations: `${k.reservations.month} reservas no mês (${k.reservations.weekGrowthPct.toFixed(1)}% vs semana anterior).`,
        delinquency: `${k.delinquency.activeCount} clientes inadimplentes totalizando R$ ${k.delinquency.totalActiveAmount.toFixed(2)}.`,
        operations: `${k.operations.occupancyRatePct.toFixed(0)}% das embarcações em uso, ${k.maintenance.activePending} manutenções abertas.`,
      },
      predictions: {
        monthEndRevenueEstimate: k.revenue.monthForecast,
        reasoning: 'Projeção linear baseada na média diária de receita do mês corrente.',
      },
      focusOfWeek: alerts[0].action,
    };
  }

  // KPI computation —— surreal level of detail :)
  private async computeKpis() {
    const TZ_OFFSET = -3 * 60 * 60 * 1000; // BRT
    const now = new Date();
    const startOfToday = new Date(Math.floor((now.getTime() + TZ_OFFSET) / 86400000) * 86400000 - TZ_OFFSET);
    const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
    const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000);
    const startOfPrevWeek = new Date(startOfWeek.getTime() - 7 * 86400000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const sumPayments = async (gte: Date, lt?: Date) => {
      const r = await this.prisma.payment.aggregate({ where: { paidAt: { gte, ...(lt ? { lt } : {}) } }, _sum: { amount: true }, _count: true });
      return { amount: r._sum.amount || 0, count: r._count || 0 };
    };
    const countReservations = async (gte: Date, lt?: Date, status?: any) => {
      return this.prisma.reservation.count({ where: { createdAt: { gte, ...(lt ? { lt } : {}) }, ...(status ? { status } : {}) } });
    };

    const [
      revToday, revYesterday, revWeek, revPrevWeek, revMonth, revPrevMonth,
      resToday, resYesterday, resWeek, resPrevWeek, resMonth, resPrevMonth,
      resCancelMonth,
      pendingCharges, overdueCharges, futureCharges,
      activeDelinq, totalUsers, activeUsers, newUsersMonth, newUsersPrevMonth,
      totalBoats, boatsInUse, boatsAvailable, boatsMaintenance,
      fuelMonth, fuelPrevMonth,
      maintActive, maintCritical, maintCompletedMonth,
      topBoatsRaw,
    ] = await Promise.all([
      sumPayments(startOfToday),
      sumPayments(startOfYesterday, startOfToday),
      sumPayments(startOfWeek),
      sumPayments(startOfPrevWeek, startOfWeek),
      sumPayments(startOfMonth),
      sumPayments(startOfPrevMonth, startOfMonth),
      countReservations(startOfToday),
      countReservations(startOfYesterday, startOfToday),
      countReservations(startOfWeek),
      countReservations(startOfPrevWeek, startOfWeek),
      countReservations(startOfMonth),
      countReservations(startOfPrevMonth, startOfMonth),
      countReservations(startOfMonth, undefined, 'CANCELLED'),
      this.prisma.charge.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true }, _count: true }),
      this.prisma.charge.aggregate({ where: { status: 'OVERDUE' }, _sum: { amount: true }, _count: true }),
      this.prisma.charge.aggregate({ where: { status: 'PENDING', dueDate: { gte: now, lt: startOfNextMonth } }, _sum: { amount: true }, _count: true }),
      this.prisma.delinquency.aggregate({ where: { status: 'ACTIVE' }, _sum: { totalAmount: true }, _count: true }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfMonth }, role: 'CLIENT' } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfPrevMonth, lt: startOfMonth }, role: 'CLIENT' } }),
      this.prisma.boat.count({ where: { deletedAt: null } }),
      this.prisma.boat.count({ where: { deletedAt: null, status: 'IN_USE' } }),
      this.prisma.boat.count({ where: { deletedAt: null, status: 'AVAILABLE' } }),
      this.prisma.boat.count({ where: { deletedAt: null, status: 'MAINTENANCE' } }),
      this.prisma.fuelLog.aggregate({ where: { loggedAt: { gte: startOfMonth } }, _sum: { liters: true, totalCost: true }, _count: true }),
      this.prisma.fuelLog.aggregate({ where: { loggedAt: { gte: startOfPrevMonth, lt: startOfMonth } }, _sum: { liters: true, totalCost: true } }),
      this.prisma.maintenance.count({ where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } } }),
      this.prisma.maintenance.count({ where: { priority: 'CRITICAL', status: { not: 'COMPLETED' } } }),
      this.prisma.maintenance.count({ where: { status: 'COMPLETED', updatedAt: { gte: startOfMonth } } }),
      this.prisma.reservation.groupBy({ by: ['boatId'], where: { createdAt: { gte: startOfMonth } }, _count: true, orderBy: { _count: { boatId: 'desc' } }, take: 5 }),
    ]);

    const topBoats = await Promise.all(topBoatsRaw.map(async (b) => {
      const boat = await this.prisma.boat.findUnique({ where: { id: b.boatId }, select: { name: true, model: true } });
      return { boatId: b.boatId, name: boat?.name || '?', model: boat?.model || '', reservations: b._count };
    }));

    const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100);
    const monthDailyAvg = revMonth.amount / Math.max(dayOfMonth, 1);
    const monthForecast = monthDailyAvg * daysInMonth;

    return {
      generatedAt: now.toISOString(),
      timezone: 'America/Sao_Paulo',
      period: {
        today: startOfToday.toISOString(),
        weekStart: startOfWeek.toISOString(),
        monthStart: startOfMonth.toISOString(),
        prevMonthStart: startOfPrevMonth.toISOString(),
        dayOfMonth,
        daysInMonth,
      },
      revenue: {
        today: revToday.amount,
        yesterday: revYesterday.amount,
        dayGrowthPct: pct(revToday.amount, revYesterday.amount),
        week: revWeek.amount,
        prevWeek: revPrevWeek.amount,
        weekGrowthPct: pct(revWeek.amount, revPrevWeek.amount),
        month: revMonth.amount,
        prevMonth: revPrevMonth.amount,
        monthGrowthPct: pct(revMonth.amount, revPrevMonth.amount),
        monthDailyAvg,
        monthForecast,
        paymentsCountMonth: revMonth.count,
      },
      reservations: {
        today: resToday,
        yesterday: resYesterday,
        dayGrowthPct: pct(resToday, resYesterday),
        week: resWeek,
        prevWeek: resPrevWeek,
        weekGrowthPct: pct(resWeek, resPrevWeek),
        month: resMonth,
        prevMonth: resPrevMonth,
        monthGrowthPct: pct(resMonth, resPrevMonth),
        cancelledMonth: resCancelMonth,
        cancelRatePct: resMonth === 0 ? 0 : (resCancelMonth / resMonth) * 100,
      },
      delinquency: {
        pendingAmount: pendingCharges._sum.amount || 0,
        pendingCount: pendingCharges._count || 0,
        overdueAmount: overdueCharges._sum.amount || 0,
        overdueCount: overdueCharges._count || 0,
        futureMonthAmount: futureCharges._sum.amount || 0,
        futureMonthCount: futureCharges._count || 0,
        activeCount: activeDelinq._count || 0,
        totalActiveAmount: activeDelinq._sum.totalAmount || 0,
      },
      users: {
        total: totalUsers,
        active: activeUsers,
        newClientsMonth: newUsersMonth,
        newClientsPrevMonth: newUsersPrevMonth,
        clientGrowthPct: pct(newUsersMonth, newUsersPrevMonth),
      },
      operations: {
        boatsTotal: totalBoats,
        boatsInUse,
        boatsAvailable,
        boatsMaintenance,
        occupancyRatePct: totalBoats === 0 ? 0 : (boatsInUse / totalBoats) * 100,
      },
      fuel: {
        monthLiters: fuelMonth._sum.liters || 0,
        monthCost: fuelMonth._sum.totalCost || 0,
        monthRefuels: fuelMonth._count || 0,
        prevMonthLiters: fuelPrevMonth._sum.liters || 0,
        prevMonthCost: fuelPrevMonth._sum.totalCost || 0,
        litersGrowthPct: pct(fuelMonth._sum.liters || 0, fuelPrevMonth._sum.liters || 0),
      },
      maintenance: {
        activePending: maintActive,
        criticalPending: maintCritical,
        completedMonth: maintCompletedMonth,
      },
      topBoatsMonth: topBoats,
    };
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

}
