import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import { CreateFuelLogDto } from './dto/create-fuel-log.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FuelService {
  private readonly logger = new Logger(FuelService.name);
  private genAI: GoogleGenerativeAI;
  private aiModel: string;
  private openai: OpenAI | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private notificationsService: NotificationsService,
  ) {
    this.genAI = new GoogleGenerativeAI(this.config.get<string>('GEMINI_API_KEY')!);
    this.aiModel = this.config.get<string>('GEMINI_MODEL', 'gemini-2.0-flash');
    const openaiKey = this.config.get<string>('OPENAI_API_KEY');
    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey, baseURL: 'https://api.openai.com/v1' });
    }
  }

  async findById(id: string) {
    return this.prisma.fuelLog.findUnique({
      where: { id },
      include: {
        boat: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(p = 1, l = 20) {
    const page = Number(p) || 1;
    const limit = Number(l) || 20;
    const [data, total] = await Promise.all([
      this.prisma.fuelLog.findMany({
        skip: (page - 1) * limit,
        take: limit,
        include: {
          boat: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fuelLog.count(),
    ]);
    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async findByOperator(operatorId: string, p = 1, l = 50) {
    const page = Number(p) || 1;
    const limit = Number(l) || 50;
    const [data, total] = await Promise.all([
      this.prisma.fuelLog.findMany({
        where: { operatorId },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          boat: { select: { id: true, name: true } },
          operator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fuelLog.count({ where: { operatorId } }),
    ]);
    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async logFuel(operatorId: string, dto: CreateFuelLogDto) {
    const boat = await this.prisma.boat.findUnique({ where: { id: dto.boatId } });
    if (!boat) throw new NotFoundException('Embarcação não encontrada');

    const priceData = await this.getCurrentPrice(boat.fuelType);
    const pricePerLiter = dto.pricePerLiter || priceData.price;
    const totalCost = dto.liters * pricePerLiter;

    // Update boat fuel level
    const newFuel = Math.min(boat.currentFuel + dto.liters, boat.fuelCapacity);

    const [fuelLog] = await Promise.all([
      this.prisma.fuelLog.create({
        data: {
          boatId: dto.boatId,
          operatorId,
          liters: dto.liters,
          pricePerLiter,
          totalCost,
          fuelType: boat.fuelType as any,
          hourMeter: dto.hourMeter,
          notes: dto.notes,
          imageUrl: dto.imageUrl,
        },
      }),
      this.prisma.boat.update({
        where: { id: dto.boatId },
        data: { currentFuel: newFuel, hourMeter: dto.hourMeter || boat.hourMeter },
      }),
    ]);

    // Auto-generate charge — split among shareholders (rateio) or target specific one
    const shares = await this.prisma.share.findMany({
      where: { boatId: dto.boatId, isActive: true },
    });

    if (shares.length > 0) {
      const targetShares = dto.targetUserId
        ? shares.filter((s) => s.userId === dto.targetUserId)
        : shares;

      if (targetShares.length > 0) {
        const costPerShare = totalCost / targetShares.length;
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        for (const share of targetShares) {
          const charge = await this.prisma.charge.create({
            data: {
              userId: share.userId,
              description: `Combustível — ${boat.name} (${dto.liters}L)`,
              amount: costPerShare,
              dueDate: today,
              category: 'FUEL',
              reference: `fuel-${fuelLog.id}`,
              boatId: dto.boatId,
            },
          });

          // Send push notification for fuel charge
          this.notificationsService.send({
            userId: share.userId,
            type: 'FUEL',
            title: '⛽ Combustível registrado',
            body: `Abastecimento de ${dto.liters}L na ${boat.name} — R$ ${costPerShare.toFixed(2)}`,
            data: { chargeId: charge.id, fuelLogId: fuelLog.id, url: '/faturas' },
            pushTag: `fuel-${fuelLog.id}-${share.userId}`,
          }).catch(() => {});
        }
      }
    }

    return { ...fuelLog, totalCost, chargedShareholders: dto.targetUserId ? 1 : shares.length };
  }

  async getByBoat(boatId: string, p = 1, l = 20) {
    const page = Number(p) || 1;
    const limit = Number(l) || 20;
    const [logs, total] = await Promise.all([
      this.prisma.fuelLog.findMany({
        where: { boatId },
        skip: (page - 1) * limit,
        take: limit,
        include: { operator: { select: { id: true, name: true } } },
        orderBy: { loggedAt: 'desc' },
      }),
      this.prisma.fuelLog.count({ where: { boatId } }),
    ]);

    return { data: logs, total, page, pages: Math.ceil(total / limit) };
  }

  async getConsumptionReport(boatId: string, startDate: Date, endDate: Date) {
    const logs = await this.prisma.fuelLog.findMany({
      where: { boatId, loggedAt: { gte: startDate, lte: endDate } },
      orderBy: { loggedAt: 'asc' },
    });

    const totalLiters = logs.reduce((sum, l) => sum + l.liters, 0);
    const totalCost = logs.reduce((sum, l) => sum + l.totalCost, 0);

    return { totalLiters, totalCost, logs: logs.length, period: { startDate, endDate } };
  }

  // ================================================================
  // FUEL PRICE MANAGEMENT
  // ================================================================

  async getCurrentPrice(fuelType?: string) {
    const ft = fuelType || 'GASOLINE';
    const latest = await this.prisma.fuelPrice.findFirst({
      where: { fuelType: ft as any },
      orderBy: { createdAt: 'desc' },
    });
    return {
      price: latest?.price || parseFloat(this.config.get('FUEL_PRICE_DEFAULT', '6.50')),
      fuelType: ft,
      updatedAt: latest?.createdAt || null,
    };
  }

  async setPrice(price: number, fuelType: string, setById?: string, notes?: string) {
    const record = await this.prisma.fuelPrice.create({
      data: {
        price,
        fuelType: fuelType as any,
        setById,
        notes,
      },
    });
    return record;
  }

  async getPriceHistory(fuelType?: string) {
    const where = fuelType ? { fuelType: fuelType as any } : {};
    return this.prisma.fuelPrice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  // ================================================================
  // GAUGE ANALYSIS VIA AI (GEMINI → OPENAI FALLBACK)
  // ================================================================

  async analyzeGauge(boatId: string, imageBase64: string, mimeType: string, cropped?: boolean) {
    const boat = await this.prisma.boat.findUnique({ where: { id: boatId } });
    if (!boat) throw new NotFoundException('Embarcação não encontrada');

    const currentPrice = await this.getCurrentPrice(boat.fuelType);

    // DEBUG: salvar imagem recebida para verificação
    try {
      const fs = require('fs');
      const debugPath = `/tmp/gauge_debug_${Date.now()}.${mimeType.includes('png') ? 'png' : 'jpg'}`;
      fs.writeFileSync(debugPath, Buffer.from(imageBase64, 'base64'));
      this.logger.log(`DEBUG: imagem salva em ${debugPath} (${Buffer.from(imageBase64, 'base64').length} bytes, mime: ${mimeType}, cropped: ${cropped})`);
    } catch (e) { this.logger.warn('DEBUG: falha ao salvar imagem', e); }

    let systemPrompt: string;
    let userPrompt: string;

    if (cropped) {
      // ============================================================
      // PROMPT PARA IMAGEM JÁ RECORTADA (só o medidor de combustível)
      // ============================================================
      systemPrompt = `Você é um especialista em leitura de medidores de combustível de jet skis e embarcações náuticas.

A imagem que você vai receber já foi RECORTADA pelo usuário para mostrar APENAS o medidor de combustível. Não precisa procurar o medidor — a imagem inteira É o medidor.

SUA TAREFA: Determinar o nível de combustível mostrado nesta imagem.

TIPOS DE MEDIDORES QUE VOCÊ PODE ENCONTRAR:

1. BARRA VERTICAL COM SEGMENTOS (Sea-Doo SPARK LCD):
   - Segmentos retangulares empilhados verticalmente
   - O display tem fundo LARANJA brilhante (backlight)
   - Segmentos ATIVOS/PREENCHIDOS aparecem como linhas MAIS ESCURAS contra o fundo laranja
   - Segmentos INATIVOS/VAZIOS são INVISÍVEIS (se misturam com o fundo laranja)
   - Preenche de BAIXO para CIMA
   - Geralmente tem 8 a 10 segmentos: cada um ≈ 10-12.5%
   - Conte quantos segmentos ESCUROS/VISÍVEIS existem na barra vertical esquerda

2. BARRA VERTICAL CONTÍNUA (Sea-Doo GTI/GTX modernos):
   - Barra colorida (amarela/laranja/verde) que sobe de E(empty) a F(full)
   - Quanto mais alta a barra preenchida, mais combustível
   - Pode ter marcas F (topo/cheio) e E (base/vazio)

3. ÍCONE TIPO BATERIA:
   - Retângulo com segmentos dentro
   - Mais segmentos preenchidos = mais combustível

4. PONTEIRO/AGULHA:
   - Agulha que aponta entre E(vazio) e F(cheio)
   - Leia a posição da agulha na escala

COMO INTERPRETAR:
- Vazio (0-10%): sem segmentos, barra na base, agulha em E
- Reserva (10-20%): 1 segmento, barra muito baixa
- Baixo (20-40%): 2-3 segmentos
- Médio (40-60%): metade preenchida
- Alto (60-80%): maioria preenchida
- Quase cheio (80-95%): quase tudo preenchido
- Cheio (95-100%): tudo preenchido, pode mostrar "F" ou "FUL"

Responda APENAS em JSON válido, sem markdown:
{"gaugePercentage": <0-100>, "confidence": <0-100>, "fuelGaugeLocation": "imagem recortada pelo usuário", "observation": "<descreva o que você vê e como determinou o nível>"}

NUNCA retorne gaugePercentage: -1. A imagem É o medidor. Sempre dê sua melhor estimativa.

ESTRATÉGIA OBRIGATÓRIA QUANDO HOUVER EXEMPLOS DE REFERÊNCIA:
1. Olhe os exemplos de referência que foram enviados junto com suas porcentagens
2. Compare VISUALMENTE a nova imagem com cada exemplo
3. Encontre o exemplo mais parecido
4. Use essa porcentagem como base da sua estimativa
5. Se a nova imagem tem MAIS barras/segmentos preenchidos que o exemplo, aumente a porcentagem
6. Se tem MENOS, diminua

Se for um LCD com fundo LARANJA (jet ski Sea-Doo):
- O medidor de combustível é a BARRA VERTICAL na BORDA ESQUERDA do LCD
- Segmentos CHEIOS = linhas MAIS ESCURAS (marrom/preto) contra o fundo laranja
- Segmentos VAZIOS = INVISÍVEIS (se misturam com o fundo laranja)
- A imagem pode mostrar APENAS esta barra se o usuário recortou`;

      userPrompt = `Esta imagem foi recortada pelo usuário para mostrar o medidor de combustível de "${boat.name}" (${boat.model}).

A imagem inteira É o medidor de combustível. NÃO diga que "não mostra o medidor" — ELA É o medidor.

SE você recebeu EXEMPLOS DE REFERÊNCIA: COMPARE esta imagem visualmente com os exemplos. Qual exemplo mais se parece com esta imagem? Use a porcentagem desse exemplo como base.

Se é um display LCD com fundo laranja de jet ski:
- Procure LINHAS HORIZONTAIS ESCURAS empilhadas verticalmente — cada uma é um segmento de combustível
- Conte as linhas escuras visíveis
- 7 linhas de 10 = 70%

Capacidade total do tanque: ${boat.fuelCapacity}L`;

    } else {
      // ============================================================
      // PROMPT PARA IMAGEM COMPLETA DO PAINEL (precisa localizar o medidor)
      // ============================================================
      systemPrompt = `Você é um especialista em análise de painéis digitais de jet skis e embarcações náuticas (Sea-Doo, Yamaha, Kawasaki, etc).
Sua ÚNICA tarefa é identificar o MEDIDOR DE COMBUSTÍVEL e determinar o nível do tanque.

REGRAS CRÍTICAS PARA IDENTIFICAÇÃO DO MEDIDOR DE COMBUSTÍVEL:

1. PAINÉIS BRP/SEA-DOO DIGITAIS COLORIDOS (modelos GTI, GTX, RXT, WAKE, FISH PRO — tela colorida):
   - O medidor de combustível é uma PEQUENA BARRA VERTICAL ou SEGMENTOS no lado ESQUERDO do painel
   - Fica SEPARADO do velocímetro/tacômetro principal
   - Tem um ÍCONE DE BOMBA DE COMBUSTÍVEL (⛽) ao lado
   - A barra vai de BAIXO (vazio) para CIMA (cheio)
   - NÃO confunda com: velocímetro (número grande central), tacômetro (arco/semicírculo grande), indicador de trim/iVTS, barra de temperatura
   - O número grande no centro (0, 6, 12, 51, 90 etc) é VELOCIDADE, NÃO é combustível
   - O arco/semicírculo grande é o TACÔMETRO (RPM), NÃO é combustível
   - Barras horizontais de "Inst/Media" são consumo instantâneo, NÃO nível do tanque

1b. PAINÉIS BRP/SEA-DOO SPARK LCD ANTIGOS (tela LCD monocromática, com backlight laranja, vermelho ou verde):
   COMO IDENTIFICAR ESTE TIPO DE PAINEL:
   - É um display LCD retangular simples, SEM tela colorida TFT
   - Fundo LARANJA (backlight normal), VERMELHO (alerta) ou esverdeado (sem luz)
   - Logo "BRP" no corpo plástico ACIMA do display
   - Mostra velocidade grande em "Km/h" no centro e "RPM" embaixo

   LAYOUT REAL DO LCD DO SPARK (baseado em fotos reais):
   ┌──────────────────────────────────────────────────┐
   │ ┌──┐                                            │
   │ │██│← FUEL   106 hr              🌡️65.8°        │
   │ │██│                                            │
   │ │██│         ████████                            │
   │ │██│         ██  0  ██     Km/h                  │
   │ │▒▒│         ████████                            │
   │ │▒▒│         ██  0  ██     RPM                   │
   │ │  │         ████████                            │
   │ └──┘                                            │
   │ [N]   ←1→ ←2→ ←3→ ←4→ ←5→ ←6→ ←7→ ←8→        │
   └──────────────────────────────────────────────────┘
   ██ = segmentos PREENCHIDOS (cheios) do fuel gauge
   ▒▒ = segmentos PARCIAIS ou APAGADOS
   (espaço vazio) = segmentos VAZIOS

   O MEDIDOR DE COMBUSTÍVEL É:
   - Uma BARRA VERTICAL FINA na EXTREMIDADE ESQUERDA do LCD
   - Composta por SEGMENTOS RETANGULARES empilhados verticalmente (geralmente 8-10 segmentos)
   - Preenche de BAIXO para CIMA (mais segmentos visíveis = mais combustível)
   - Fica COLADO na borda esquerda, ANTES de qualquer número
   - Acima da barra pode ter um pequeno ícone ⛽ ou texto "FUL"/"F"
   - É o ÚNICO elemento vertical no lado esquerdo — fácil de identificar!

   COMO OS SEGMENTOS APARECEM NO LCD LARANJA:
   - O fundo do display é LARANJA BRILHANTE (backlight)
   - Segmentos ATIVOS (cheios) = linhas/retângulos MAIS ESCUROS que contrastam com o fundo laranja
   - Segmentos INATIVOS (vazios) = INVISÍVEIS, se misturam com o fundo laranja
   - NÃO procure por segmentos "brilhantes" ou "acesos" — procure por LINHAS ESCURAS!
   - As linhas escuras são finas barras horizontais empilhadas verticalmente

   EXEMPLOS REAIS DE LEITURA:
   - Foto mostrando "106 hr, 0 Km/h, 65.8°": barra esquerda com ~6 segmentos acesos de 8 = ~75%
   - Foto mostrando "90 Km/h, 72.5°", texto "FUL" visível no topo esquerdo: barra totalmente cheia = ~95-100%
   - Foto mostrando "120 hr, 0 Km/h": barra com poucos segmentos = verificar quantos estão acesos
   - Foto mostrando "118, 0 Km/h": barra com maioria dos segmentos acesos = ~80-90%

   COMO CONTAR OS SEGMENTOS:
   - Olhe para a BORDA ESQUERDA do LCD
   - Procure linhas/retângulos MAIS ESCUROS que o fundo laranja — esses são os segmentos PREENCHIDOS
   - A área VAZIA (sem combustível) é onde NÃO há linhas escuras (só fundo laranja liso)
   - A barra total tem geralmente 8 a 10 segmentos
   
   TABELA DE CONVERSÃO (segmentos escuros visíveis → porcentagem):
     * 0 de 10 (nenhuma linha escura visível): 0-5% (CRÍTICO)
     * 1 de 10: 5-10% (RESERVA)
     * 2 de 10: 10-20%
     * 3 de 10: 20-30%
     * 4 de 10: 30-40%
     * 5 de 10: 40-50%
     * 6 de 10: 50-60%
     * 7 de 10: 60-70%
     * 8 de 10: 70-80%
     * 9 de 10: 80-90%
     * 10 de 10 (barra cheia, pode mostrar "FUL"): 90-100%

   OUTROS ELEMENTOS — NÃO SÃO COMBUSTÍVEL:
   - Número grande central (0, 5, 60, 90, 106): VELOCIDADE em Km/h
   - Número menor embaixo do velocímetro: RPM
   - Número no CANTO SUPERIOR com "hr": HORÍMETRO (horas de uso, ex: 106 hr, 0.5 hr)
   - Número com "°" (ex: 65.8°, 72.5°): TEMPERATURA do motor
   - "N" = neutro, "R" = ré
   - Fileira de setas/números na PARTE INFERIOR (←1→ ←2→ ... ←8→): indicador de RPM/marcha (NÃO é combustível!)
   - "CHECK KEY", "SOS" = mensagens de erro do sistema
   - Texto "Bkm" ou similar = odômetro

2. PAINÉIS YAMAHA (modelos FX, VX, GP, EX):
   - Medidor de combustível geralmente com ícone F/E ou barras laterais
   - Pode ter display digital com barras segmentadas
   - NÃO confundir com velocímetro ou conta-giros

3. PAINÉIS KAWASAKI:
   - Similar aos demais, procure ícone de bomba de combustível

4. INTERPRETAÇÃO DO NÍVEL:
   - Se a barra de combustível está quase vazia (1-2 segmentos visíveis ou barra muito baixa): 5-15%
   - Se aparece indicador de RESERVA ou luz de alerta de combustível: 5-10%
   - Meia barra: 40-60%
   - Barra quase cheia: 75-90%
   - Barra totalmente cheia: 95-100%
   - Se houver um número explícito de litros ou porcentagem no display, USE ESSE VALOR

5. ATENÇÃO ESPECIAL:
   - Em painéis digitais modernos BRP com tela colorida, o medidor de combustível pode ser apenas uma FINA BARRA VERTICAL no canto inferior esquerdo
   - O "F" significa FULL (cheio) e fica no TOPO da barra
   - O "E" significa EMPTY (vazio) e fica na BASE da barra
   - Se a barra amarela/laranja está apenas na parte de baixo = quase vazio (reserva)
   - Em painéis LCD antigos do Sea-Doo SPARK: o medidor de combustível é um ÍCONE MINÚSCULO tipo bateria no CANTO SUPERIOR ESQUERDO do LCD. Conte os segmentos preenchidos dentro desse ícone para determinar o nível. É muito pequeno — preste atenção!
   - Se o display LCD está com fundo VERMELHO/LARANJA intenso, pode indicar alerta (baixo combustível, erro, etc.)
   - Se aparecer "CHECK KEY" ou "SOS", o jet ski pode estar em modo de erro, mas ainda assim tente ler o ícone de combustível

Responda APENAS em JSON válido, sem markdown, sem texto adicional.
O JSON deve ter exatamente este formato:
{"gaugePercentage": <número de 0 a 100>, "confidence": <número de 0 a 100>, "fuelGaugeLocation": "<onde encontrou o medidor na imagem>", "observation": "<observação detalhada sobre a leitura, incluindo o que identificou como medidor de combustível e por que>"}

REGRA DE OURO: SEMPRE tente dar uma leitura, mesmo com confiança baixa. 
- Se você vê QUALQUER elemento que pode ser o medidor de combustível (barra, ícone, segmentos no lado esquerdo), dê uma estimativa com a confiança que tiver.
- Se é um painel LCD de Sea-Doo SPARK, procure ESPECIFICAMENTE no lado ESQUERDO do LCD por barras ou ícones com segmentos.
- Retorne gaugePercentage: -1 SOMENTE se a imagem não for de um painel de embarcação, estiver completamente ilegível, ou for uma foto de outro objeto que não é um painel.
- NÃO retorne -1 só porque não tem certeza — dê sua melhor estimativa com confidence baixa (ex: 30-50).`;
      userPrompt = `Analise esta foto do painel de uma embarcação "${boat.name}" (${boat.model}).

IMPORTANTE: Identifique APENAS o medidor de COMBUSTÍVEL.
- Se for um painel COLORIDO (GTI/GTX/RXT): procure a barra vertical com ícone ⛽ no lado esquerdo.
- Se for um painel LCD SIMPLES (SPARK/antigos): procure o ícone tipo bateria ou barra com segmentos no LADO ESQUERDO do LCD. O fundo pode ser laranja, vermelho ou verde.
- NÃO confunda com velocímetro (número grande central), tacômetro (arco grande), horímetro, ou barra de RPM.

Determine o nível atual do tanque de combustível em porcentagem (0% = vazio/E, 100% = cheio/F).
Capacidade do tanque: ${boat.fuelCapacity}L
Tipo de combustível: ${boat.fuelType}

Descreva exatamente ONDE na imagem você encontrou o medidor de combustível e como interpretou o nível. SEMPRE tente dar uma leitura, mesmo com confiança baixa.`;
    }

    let analysis: any;
    const hasExamples = (await this.prisma.gaugeExample.count()) > 0;
    this.logger.log(`Iniciando análise para ${boat.name} (${boat.model}). Exemplos de treino: ${hasExamples ? 'SIM' : 'NÃO'}. Imagem recortada: ${cropped ? 'SIM' : 'NÃO'}`);

    // Try Gemini first (with examples if available)
    try {
      analysis = hasExamples
        ? await this.analyzeWithGeminiAndExamples(systemPrompt, userPrompt, imageBase64, mimeType)
        : await this.analyzeWithGemini(systemPrompt, userPrompt, imageBase64, mimeType);
      this.logger.log('Análise realizada via Gemini');
    } catch (geminiError) {
      this.logger.warn('Gemini falhou, tentando OpenAI como fallback...', geminiError?.message || geminiError);

      // Fallback to OpenAI
      if (!this.openai) {
        throw new Error('Gemini indisponível e OpenAI não configurada. Verifique suas API keys.');
      }

      try {
        analysis = hasExamples
          ? await this.analyzeWithOpenAIAndExamples(systemPrompt, userPrompt, imageBase64, mimeType)
          : await this.analyzeWithOpenAI(systemPrompt, userPrompt, imageBase64, mimeType);
        this.logger.log('Análise realizada via OpenAI (fallback)');
      } catch (openaiError) {
        this.logger.error('OpenAI também falhou', openaiError?.message || openaiError);
        throw new Error('Falha na análise da imagem. Ambos os serviços de IA estão indisponíveis. Tente novamente mais tarde.');
      }
    }

    this.logger.log(`Resultado da análise: gaugePercentage=${analysis.gaugePercentage}, confidence=${analysis.confidence}, observation=${analysis.observation}`);

    const gaugePercent = analysis.gaugePercentage;
    const confidence = analysis.confidence || 0;

    // Se a imagem já era recortada e a IA retornou -1 ou confiança muito baixa, force estimativa
    if (cropped && (gaugePercent < 0 || confidence < 20)) {
      this.logger.warn(`IA retornou resultado ruim para imagem recortada (gauge=${gaugePercent}, conf=${confidence}) — forçando estimativa de 50%`);
      analysis.gaugePercentage = 50;
      analysis.confidence = 20;
      analysis.observation = 'Não foi possível interpretar o medidor recortado automaticamente. Estimativa padrão aplicada — ajuste manualmente o valor de litros.';
    }

    // RETRY com prompt SPARK se a análise falhou (gaugePercentage -1 OU confiança muito baixa OU gauge=0 suspeito)
    const needsRetry = analysis.gaugePercentage < 0 || (confidence < 30 && !cropped) || (analysis.gaugePercentage === 0 && !cropped);
    if (needsRetry) {
      this.logger.warn(`Análise insatisfatória (gauge=${gaugePercent}, conf=${confidence}), tentando prompt focado para SPARK LCD...`);
      const retryAnalysis = await this.retryWithSparkPrompt(boat, imageBase64, mimeType);
      if (retryAnalysis && retryAnalysis.gaugePercentage >= 0) {
        const currentLiters = (retryAnalysis.gaugePercentage / 100) * boat.fuelCapacity;
        const litersNeeded = Math.max(0, boat.fuelCapacity - currentLiters);
        const estimatedCost = litersNeeded * currentPrice.price;
        return {
          success: true,
          boat: { id: boat.id, name: boat.name, model: boat.model, fuelType: boat.fuelType },
          tankCapacity: boat.fuelCapacity,
          gaugePercentage: retryAnalysis.gaugePercentage,
          currentLiters: Math.round(currentLiters * 10) / 10,
          litersNeeded: Math.round(litersNeeded * 10) / 10,
          pricePerLiter: currentPrice.price,
          estimatedCost: Math.round(estimatedCost * 100) / 100,
          confidence: retryAnalysis.confidence,
          observation: retryAnalysis.observation,
        };
      }

      return {
        success: false,
        message: 'Não foi possível identificar o medidor de combustível na imagem.',
        observation: analysis.observation,
      };
    }

    const finalPercent = analysis.gaugePercentage;
    const currentLiters = (finalPercent / 100) * boat.fuelCapacity;
    const litersNeeded = Math.max(0, boat.fuelCapacity - currentLiters);
    const estimatedCost = litersNeeded * currentPrice.price;

    return {
      success: true,
      boat: { id: boat.id, name: boat.name, model: boat.model, fuelType: boat.fuelType },
      tankCapacity: boat.fuelCapacity,
      gaugePercentage: finalPercent,
      currentLiters: Math.round(currentLiters * 10) / 10,
      litersNeeded: Math.round(litersNeeded * 10) / 10,
      pricePerLiter: currentPrice.price,
      estimatedCost: Math.round(estimatedCost * 100) / 100,
      confidence: analysis.confidence,
      observation: analysis.observation,
    };
  }

  private async retryWithSparkPrompt(boat: any, imageBase64: string, mimeType: string) {
    const hasExamples = (await this.prisma.gaugeExample.count()) > 0;
    this.logger.log(`Retry SPARK: exemplos disponíveis: ${hasExamples}`);

    const sparkSystemPrompt = `Você é um especialista em painéis LCD de jet skis BRP/Sea-Doo.

ESTA IMAGEM MOSTRA UM PAINEL LCD COM FUNDO LARANJA DE JET SKI. É um display retangular com backlight laranja (Sea-Doo SPARK ou similar modelo BRP com LCD monocromático).

SUA ÚNICA TAREFA: Ler o nível de combustível na BARRA VERTICAL da BORDA ESQUERDA do LCD.

COMO ENCONTRAR O MEDIDOR DE COMBUSTÍVEL:
1. Olhe para a EXTREMIDADE ESQUERDA do display LCD retangular
2. Lá existe uma COLUNA VERTICAL FINA com segmentos empilhados
3. Os segmentos são linhas horizontais finas, empilhadas de baixo para cima
4. Acima pode haver um ícone de bomba de combustível ⛽

APARÊNCIA DOS SEGMENTOS NO LCD LARANJA:
- O fundo do display inteiro é LARANJA BRILHANTE (backlight)
- Os segmentos ATIVOS (com combustível) aparecem como LINHAS MAIS ESCURAS/MARRONS que contrastam levemente com o fundo laranja
- Os segmentos INATIVOS (sem combustível no topo) são INVISÍVEIS — se misturam com o fundo laranja
- Procure LINHAS HORIZONTAIS ESCURAS empilhadas na borda esquerda
- Quanto mais linhas escuras de baixo para cima → mais combustível

TABELA (linhas escuras visíveis → porcentagem):
- 0: 0-5%  |  1-2: 10-20%  |  3: 25-35%  |  4-5: 35-50%
- 6: 55-65%  |  7: 65-75%  |  8: 75-85%  |  9-10: 85-100%

NÃO É COMBUSTÍVEL:
- Número "0" grande central = VELOCIDADE
- Número embaixo = RPM  
- Número com "hr" = HORÍMETRO
- Número com "°" = TEMPERATURA

Responda APENAS em JSON: {"gaugePercentage": <0-100>, "confidence": <0-100>, "fuelGaugeLocation": "<onde>", "observation": "<o que viu>"}
NUNCA retorne -1. SEMPRE estime.`;

    const sparkUserPrompt = `FOTO DE PAINEL LCD DE JET SKI COM FUNDO LARANJA.

TAREFA ESPECÍFICA: Olhe para a BORDA ESQUERDA do display LCD retangular.
Conte quantas LINHAS HORIZONTAIS ESCURAS (mais escuras que o fundo laranja) estão empilhadas verticalmente ali. São pequenas e finas.

Essas linhas são o medidor de combustível:
- 7 linhas escuras = ~70%
- 3 linhas escuras = ~30%
- 0 linhas = 0-5%

Embarcação: ${boat.name} (${boat.model}), Capacidade: ${boat.fuelCapacity}L`;

    try {
      let result;
      if (hasExamples) {
        result = await this.analyzeWithGeminiAndExamples(sparkSystemPrompt, sparkUserPrompt, imageBase64, mimeType);
      } else {
        result = await this.analyzeWithGemini(sparkSystemPrompt, sparkUserPrompt, imageBase64, mimeType);
      }
      this.logger.log(`Retry SPARK via Gemini OK: gauge=${result.gaugePercentage}, conf=${result.confidence}`);
      return result;
    } catch (e: any) {
      this.logger.warn('Retry SPARK Gemini falhou', e?.message);
      if (this.openai) {
        try {
          let result;
          if (hasExamples) {
            result = await this.analyzeWithOpenAIAndExamples(sparkSystemPrompt, sparkUserPrompt, imageBase64, mimeType);
          } else {
            result = await this.analyzeWithOpenAI(sparkSystemPrompt, sparkUserPrompt, imageBase64, mimeType);
          }
          this.logger.log(`Retry SPARK via OpenAI OK: gauge=${result.gaugePercentage}, conf=${result.confidence}`);
          return result;
        } catch (e2: any) {
          this.logger.warn('Retry SPARK OpenAI falhou', e2?.message);
        }
      }
    }
    return null;
  }

  private async analyzeWithGemini(systemPrompt: string, userPrompt: string, imageBase64: string, mimeType: string) {
    const model = this.genAI.getGenerativeModel({
      model: this.aiModel,
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContent([
      userPrompt,
      { inlineData: { mimeType, data: imageBase64 } },
    ]);

    const text = result.response.text();
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  }

  private async analyzeWithOpenAI(systemPrompt: string, userPrompt: string, imageBase64: string, mimeType: string) {
    const response = await this.openai!.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' },
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    const text = response.choices[0]?.message?.content || '';
    this.logger.log(`OpenAI raw response: ${text}`);
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  }

  // ================================================================
  // GAUGE TRAINING EXAMPLES (few-shot learning)
  // ================================================================

  async getGaugeExamples(dashboardType?: string) {
    const where = dashboardType ? { dashboardType } : {};
    const examples = await this.prisma.gaugeExample.findMany({
      where,
      orderBy: { percentage: 'asc' },
      select: { id: true, percentage: true, dashboardType: true, description: true, mimeType: true, imageBase64: true, createdAt: true },
    });
    return { data: examples, total: examples.length };
  }

  async getGaugeExampleWithImage(id: string) {
    return this.prisma.gaugeExample.findUnique({ where: { id } });
  }

  async addGaugeExample(imageBase64: string, mimeType: string, percentage: number, dashboardType: string, description?: string) {
    return this.prisma.gaugeExample.create({
      data: { imageBase64, mimeType, percentage, dashboardType, description },
      select: { id: true, percentage: true, dashboardType: true, description: true, createdAt: true },
    });
  }

  async removeGaugeExample(id: string) {
    await this.prisma.gaugeExample.delete({ where: { id } });
    return { success: true };
  }

  private async buildExamplesPrompt(): Promise<string> {
    const examples = await this.prisma.gaugeExample.findMany({
      orderBy: { percentage: 'asc' },
      select: { percentage: true, dashboardType: true, description: true },
    });
    if (examples.length === 0) return '';
    const lines = examples.map(e =>
      `- ${e.percentage}% (${e.dashboardType}): ${e.description || 'sem descrição'}`
    ).join('\n');
    return `\n\nIMPORTANTE — EXEMPLOS DE REFERÊNCIA CALIBRADOS PELO OPERADOR:\n${lines}\n\nVocê DEVE usar os exemplos acima para COMPARAR visualmente com a nova imagem.\nEncontre qual exemplo é mais parecido e baseie sua estimativa nele.\nSe a nova imagem tem MAIS segmentos/barras preenchidas que um exemplo de 60%, então a porcentagem deve ser MAIOR que 60%.\nSe tem MENOS, deve ser MENOR.\nNUNCA ignore os exemplos — eles são a verdade calibrada pelo operador.\n`;
  }

  private async getExampleImages(): Promise<Array<{ base64: string; mimeType: string; percentage: number; description?: string }>> {
    // Pegar TODOS os exemplos e selecionar 1 por nível de porcentagem (diversidade máxima)
    const allExamples = await this.prisma.gaugeExample.findMany({
      orderBy: { percentage: 'asc' },
    });
    
    // Agrupar por porcentagem e pegar apenas 1 de cada
    const byPercentage = new Map<number, typeof allExamples[0]>();
    for (const ex of allExamples) {
      if (!byPercentage.has(ex.percentage)) {
        byPercentage.set(ex.percentage, ex);
      }
    }
    
    const diverse = Array.from(byPercentage.values()).slice(0, 8); // máximo 8 exemplos únicos
    this.logger.log(`Exemplos selecionados: ${diverse.map(e => e.percentage + '%').join(', ')} (${diverse.length} de ${allExamples.length} totais)`);
    
    return diverse.map(e => ({
      base64: e.imageBase64,
      mimeType: e.mimeType,
      percentage: e.percentage,
      description: e.description || undefined,
    }));
  }

  private async analyzeWithGeminiAndExamples(systemPrompt: string, userPrompt: string, imageBase64: string, mimeType: string) {
    const examples = await this.getExampleImages();
    const examplesPrompt = await this.buildExamplesPrompt();
    const fullSystemPrompt = systemPrompt + examplesPrompt;
    this.logger.log(`Gemini+Examples: enviando ${examples.length} imagem(ns) de referência`);

    const model = this.genAI.getGenerativeModel({
      model: this.aiModel,
      systemInstruction: fullSystemPrompt,
    });

    const parts: any[] = [];

    // Adiciona exemplos de referência como imagens
    if (examples.length > 0) {
      parts.push({ text: 'EXEMPLOS DE REFERÊNCIA COM PORCENTAGEM REAL — Compare visualmente a nova foto com estes exemplos calibrados pelo operador:' });
      for (const ex of examples) {
        parts.push({ text: `EXEMPLO CALIBRADO: ${ex.percentage}% de combustível${ex.description ? ` (${ex.description})` : ''}. Memorize a aparência.` });
        parts.push({ inlineData: { mimeType: ex.mimeType, data: ex.base64 } });
      }
      parts.push({ text: '\n---\nAGORA COMPARE A NOVA IMAGEM com os exemplos acima. Encontre o exemplo mais parecido e baseie sua estimativa nele:' });
    }

    parts.push({ text: userPrompt });
    parts.push({ inlineData: { mimeType, data: imageBase64 } });

    const result = await model.generateContent(parts);
    const text = result.response.text();
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  }

  private async analyzeWithOpenAIAndExamples(systemPrompt: string, userPrompt: string, imageBase64: string, mimeType: string) {
    const examples = await this.getExampleImages();
    this.logger.log(`OpenAI+Examples: enviando ${examples.length} imagem(ns) de referência (${examples.map(e => e.percentage + '%').join(', ')})`);

    // Quando temos exemplos, usa prompt de COMPARAÇÃO VISUAL pura
    const comparisonSystem = `Você é um sistema de COMPARAÇÃO VISUAL de medidores de combustível de jet skis.

Você receberá:
1. EXEMPLOS DE REFERÊNCIA: fotos de medidores de combustível COM a porcentagem real já indicada
2. UMA NOVA IMAGEM: que precisa ser analisada

SUA TAREFA: Compare a nova imagem com os exemplos de referência e determine qual exemplo é MAIS PARECIDO visualmente.

REGRAS:
- Foque na BARRA/SEGMENTOS de combustível (geralmente no lado esquerdo do display)
- Compare a QUANTIDADE de barras/segmentos preenchidos entre a nova imagem e os exemplos
- Se a nova imagem tem aparência similar ao exemplo de 60%, retorne ~60%
- Se está ENTRE dois exemplos (ex: entre 30% e 50%), interpole o valor
- Se a nova imagem tem MAIS barras preenchidas que TODOS os exemplos, retorne um valor maior
- Se tem MENOS que todos, retorne um valor menor

SOBRE O DISPLAY LCD LARANJA (Sea-Doo SPARK):
- É um display retangular com fundo LARANJA (backlight)
- O medidor de combustível é a BARRA VERTICAL na BORDA ESQUERDA do display
- Segmentos preenchidos = linhas/retângulos levemente mais escuros que o fundo laranja
- Esses segmentos são SUTIS — olhe com atenção para o lado esquerdo do LCD
- A imagem NÃO está "escura" — é assim que este tipo de display aparece
- O fundo PRETO ao redor é o plástico do painel do jet ski

NUNCA diga que "a imagem está escura" ou "não é possível ver o medidor". Os exemplos de referência mostram EXATAMENTE como o medidor aparece — use-os para comparar.

Responda APENAS em JSON: {"gaugePercentage": <0-100>, "confidence": <0-100>, "fuelGaugeLocation": "<onde>", "observation": "<qual exemplo mais se parece e por quê>"}`;

    const messages: any[] = [
      { role: 'system', content: comparisonSystem },
    ];

    // Enviar exemplos
    if (examples.length > 0) {
      const exContent: any[] = [{ type: 'text', text: `Aqui estão ${examples.length} EXEMPLOS DE REFERÊNCIA. Cada imagem mostra um medidor de combustível de jet ski com a porcentagem REAL confirmada pelo operador:` }];
      for (const ex of examples) {
        exContent.push({ type: 'text', text: `▶ REFERÊNCIA ${ex.percentage}%: Nesta foto o medidor está em ${ex.percentage}%.${ex.description ? ' Detalhe: ' + ex.description : ''}` });
        exContent.push({ type: 'image_url', image_url: { url: `data:${ex.mimeType};base64,${ex.base64}`, detail: 'high' } });
      }
      messages.push({ role: 'user', content: exContent });
      messages.push({ role: 'assistant', content: `Entendido. Recebi ${examples.length} exemplos de referência com porcentagens: ${examples.map(e => e.percentage + '%').join(', ')}. Posso ver o display LCD laranja do Sea-Doo com a barra de combustível no lado esquerdo em cada exemplo. Estou pronto para comparar uma nova imagem com esses exemplos.` });
    }

    const comparisonNote = examples.length > 0 
      ? `\n\nCOMPARE esta imagem com os ${examples.length} exemplos. Qual exemplo MAIS SE PARECE com esta imagem em termos de quantidade de barras/segmentos preenchidos no medidor de combustível? Use a porcentagem desse exemplo como base.`
      : '';

    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userPrompt + comparisonNote },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
      ],
    });

    const response = await this.openai!.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 500,
    });

    const text = response.choices[0]?.message?.content || '';
    this.logger.log(`OpenAI raw response: ${text}`);
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  }
}
