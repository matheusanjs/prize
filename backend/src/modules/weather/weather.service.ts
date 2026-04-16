import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { PrismaService } from '../../database/prisma.service';
import { HGBrasilCurrentData, HGBrasilForecastDay } from './hgbrasil.service';

export enum NavigationLevel {
  BOM = 'BOM',
  ATENCAO = 'ATENCAO',
  RUIM = 'RUIM',
  PERIGOSO = 'PERIGOSO',
}

interface ClassificationResult {
  level: NavigationLevel;
  score: number;
}

export interface ForecastDay {
  date: string;
  dayOfWeek: string;
  navigationLevel: NavigationLevel;
  navigationScore: number;
  windSpeedMin: number;
  windSpeedMax: number;
  gustMax: number;
  waveHeightMin: number;
  waveHeightMax: number;
  swellHeightMax: number;
  airTempMin: number;
  airTempMax: number;
  waterTemp: number;
  clientSummary: string;
  // HGBrasil extra fields
  humidity?: number;
  cloudiness?: number;
  rain?: number;
  rainProbability?: number;
  description?: string;
  condition?: string;
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private cachedForecast: HGBrasilForecastDay[] = [];
  private forecastCachedAt: Date | null = null;
  private cachedAiSummary: string | null = null;
  private aiSummaryCachedAt: Date | null = null;
  private genAI: GoogleGenerativeAI;
  private geminiModel: string;
  private openai: OpenAI | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.genAI = new GoogleGenerativeAI(this.config.get<string>('GEMINI_API_KEY')!);
    this.geminiModel = this.config.get<string>('GEMINI_MODEL', 'gemini-2.0-flash');
    const openaiKey = this.config.get<string>('OPENAI_API_KEY');
    if (openaiKey) this.openai = new OpenAI({ apiKey: openaiKey, baseURL: 'https://api.openai.com/v1' });
  }

  classifyWeather(data: HGBrasilCurrentData): ClassificationResult {
    const wind = data.windSpeed; // already km/h
    const rain = data.rain;
    const cloudiness = data.cloudiness;

    let score = 0;

    // Wind (km/h)
    if (wind > 50) score += 40;
    else if (wind > 35) score += 25;
    else if (wind > 20) score += 15;
    else if (wind > 10) score += 5;

    // Rain (mm)
    if (rain > 10) score += 30;
    else if (rain > 5) score += 20;
    else if (rain > 2) score += 10;
    else if (rain > 0) score += 5;

    // Cloudiness
    if (cloudiness > 90) score += 10;
    else if (cloudiness > 70) score += 5;

    // Condition-based adjustments
    const slug = data.conditionSlug;
    if (slug === 'storm') score += 20;
    else if (slug === 'rain') score += 10;

    let level: NavigationLevel;
    if (score >= 60) level = NavigationLevel.PERIGOSO;
    else if (score >= 35) level = NavigationLevel.RUIM;
    else if (score >= 15) level = NavigationLevel.ATENCAO;
    else level = NavigationLevel.BOM;

    return { level, score };
  }

  classifyForecastDay(day: HGBrasilForecastDay): ClassificationResult {
    const windSpeed = this.parseWindSpeed(day.windSpeedy);
    const rain = day.rain;
    const rainProb = day.rainProbability;
    const cloudiness = day.cloudiness;

    let score = 0;

    if (windSpeed > 50) score += 40;
    else if (windSpeed > 35) score += 25;
    else if (windSpeed > 20) score += 15;
    else if (windSpeed > 10) score += 5;

    if (rain > 10) score += 30;
    else if (rain > 5) score += 20;
    else if (rain > 2) score += 10;
    else if (rain > 0) score += 5;

    if (rainProb > 80) score += 10;
    else if (rainProb > 50) score += 5;

    if (cloudiness > 90) score += 10;
    else if (cloudiness > 70) score += 5;

    if (day.condition === 'storm') score += 20;
    else if (day.condition === 'rain' && rain > 5) score += 5;

    let level: NavigationLevel;
    if (score >= 60) level = NavigationLevel.PERIGOSO;
    else if (score >= 35) level = NavigationLevel.RUIM;
    else if (score >= 15) level = NavigationLevel.ATENCAO;
    else level = NavigationLevel.BOM;

    return { level, score };
  }

  private parseWindSpeed(windSpeedy: string): number {
    const match = windSpeedy?.match(/([\d.]+)/);
    return match ? parseFloat(match[1]) : 0;
  }

  generateClientSummary(level: NavigationLevel, data: HGBrasilCurrentData): string {
    const wind = Math.round(data.windSpeed);

    switch (level) {
      case NavigationLevel.BOM:
        return `${data.description}. Condições favoráveis para navegação! ☀️`;
      case NavigationLevel.ATENCAO:
        return `${data.description}, vento de ${wind}km/h. Navegue com atenção. ⚠️`;
      case NavigationLevel.RUIM:
        return `${data.description}, vento de ${wind}km/h. Recomendamos cautela. 🌊`;
      case NavigationLevel.PERIGOSO:
        return `${data.description}, vento forte de ${wind}km/h. Navegação não recomendada. 🚫`;
    }
  }

  generateOperatorSummary(data: HGBrasilCurrentData): string {
    return [
      `Temp: ${data.temp}°C`,
      `Vento: ${data.windSpeed.toFixed(1)}km/h ${data.windCardinal}`,
      `Umidade: ${data.humidity}%`,
      `Nebulosidade: ${data.cloudiness}%`,
      `Chuva: ${data.rain}mm`,
      `${data.description}`,
    ].join(' | ');
  }

  async saveSnapshot(
    lat: number,
    lng: number,
    data: HGBrasilCurrentData,
    classification: ClassificationResult,
    clientSummary: string,
    operatorSummary: string,
  ) {
    return this.prisma.marineWeatherSnapshot.create({
      data: {
        latitude: lat,
        longitude: lng,
        collectedAt: new Date(),
        source: 'hgbrasil',
        windSpeed: data.windSpeed / 3.6, // store as m/s for DB compatibility
        windDirection: data.windDirection,
        airTemperature: data.temp,
        cloudCover: data.cloudiness,
        humidity: data.humidity,
        precipitation: data.rain,
        navigationLevel: classification.level,
        navigationScore: classification.score,
        operatorSummary,
        clientSummary,
        isValid: true,
      },
    });
  }

  async saveErrorSnapshot(lat: number, lng: number, errorMessage: string) {
    return this.prisma.marineWeatherSnapshot.create({
      data: {
        latitude: lat,
        longitude: lng,
        collectedAt: new Date(),
        source: 'hgbrasil',
        isValid: false,
        errorMessage,
      },
    });
  }

  async getLatestValid() {
    return this.prisma.marineWeatherSnapshot.findFirst({
      where: { isValid: true },
      orderBy: { collectedAt: 'desc' },
    });
  }

  async getHistory(hours: number = 24) {
    const since = new Date(Date.now() - hours * 3600_000);
    return this.prisma.marineWeatherSnapshot.findMany({
      where: { collectedAt: { gte: since }, isValid: true },
      orderBy: { collectedAt: 'desc' },
    });
  }

  cacheForecast(forecastDays: HGBrasilForecastDay[]) {
    this.cachedForecast = forecastDays;
    this.forecastCachedAt = new Date();
    this.logger.log(`Forecast cached: ${forecastDays.length} days`);
  }

  getForecastDays(): { days: ForecastDay[]; cachedAt: string | null } {
    if (!this.cachedForecast.length || !this.forecastCachedAt) {
      return { days: [], cachedAt: null };
    }

    const weekDayMap: Record<string, string> = {
      'Seg': 'Segunda', 'Ter': 'Terça', 'Qua': 'Quarta',
      'Qui': 'Quinta', 'Sex': 'Sexta', 'Sáb': 'Sábado', 'Dom': 'Domingo',
    };

    const days: ForecastDay[] = this.cachedForecast.map((f) => {
      const classification = this.classifyForecastDay(f);
      const windSpeed = this.parseWindSpeed(f.windSpeedy);

      // Parse full_date DD/MM/YYYY → YYYY-MM-DD
      const [dd, mm, yyyy] = f.fullDate.split('/');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const dayOfWeek = weekDayMap[f.weekday] || f.weekday;

      let clientSummary: string;
      switch (classification.level) {
        case NavigationLevel.BOM:
          clientSummary = `${f.description}, ${f.min}–${f.max}°C ☀️`;
          break;
        case NavigationLevel.ATENCAO:
          clientSummary = `${f.description}, vento ${Math.round(windSpeed)}km/h ⚠️`;
          break;
        case NavigationLevel.RUIM:
          clientSummary = `${f.description}, chuva ${f.rain}mm 🌊`;
          break;
        case NavigationLevel.PERIGOSO:
          clientSummary = `${f.description}, vento ${Math.round(windSpeed)}km/h 🚫`;
          break;
      }

      return {
        date: dateStr,
        dayOfWeek,
        navigationLevel: classification.level,
        navigationScore: classification.score,
        windSpeedMin: Math.round(windSpeed),
        windSpeedMax: Math.round(windSpeed),
        gustMax: 0,
        waveHeightMin: 0,
        waveHeightMax: 0,
        swellHeightMax: 0,
        airTempMin: f.min,
        airTempMax: f.max,
        waterTemp: 0,
        clientSummary,
        humidity: f.humidity,
        cloudiness: f.cloudiness,
        rain: f.rain,
        rainProbability: f.rainProbability,
        description: f.description,
        condition: f.condition,
      };
    });

    return { days, cachedAt: this.forecastCachedAt.toISOString() };
  }

  // ================================================================
  // AI Navigation Summary
  // ================================================================

  async generateAiSummary(current: HGBrasilCurrentData, forecast: HGBrasilForecastDay[]) {
    try {
      const now = new Date();
      const brTime = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      const forecastText = forecast
        .map((f) => `${f.date} (${f.weekday}): ${f.description}, ${f.min}–${f.max}°C, vento ${f.windSpeedy}, chuva ${f.rain}mm (${f.rainProbability}% chance), umidade ${f.humidity}%, nebulosidade ${f.cloudiness}%`)
        .join('\n');

      const systemPrompt = `Você é um assistente de marina em Cabo Frio, RJ. Gere um resumo CURTO (máximo 3 frases) sobre as condições de navegação para os clientes da marina.

Regras:
- Escreva em português informal e amigável, como se fosse um marinheiro experiente falando
- Diga se é bom ou ruim para navegar AGORA
- Diga se vai mudar ao longo do dia (manhã/tarde/noite) baseado na previsão
- Mencione vento e chuva se relevantes
- NÃO use emojis, NÃO use markdown, só texto puro
- Máximo 3 frases curtas`;

      const userPrompt = `Dados atuais (${brTime}):
- Condição: ${current.description}
- Temperatura: ${current.temp}°C
- Vento: ${current.windSpeed.toFixed(1)} km/h de ${current.windCardinal}
- Umidade: ${current.humidity}%
- Nebulosidade: ${current.cloudiness}%
- Chuva: ${current.rain}mm
- Nascer do sol: ${current.sunrise} | Pôr do sol: ${current.sunset}
- Período: ${current.currently === 'dia' ? 'Dia' : 'Noite'}

Previsão:
${forecastText}`;

      let text: string;
      try {
        const model = this.genAI.getGenerativeModel({ model: this.geminiModel });
        const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
        text = result.response.text().trim();
      } catch (geminiErr: any) {
        this.logger.warn(`Gemini AI summary failed, trying OpenAI... ${geminiErr?.message}`);
        if (!this.openai) throw new Error('OpenAI não configurada');
        const completion = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 256,
        });
        text = (completion.choices[0]?.message?.content || '').trim();
      }

      this.cachedAiSummary = text;
      this.aiSummaryCachedAt = new Date();
      this.logger.log(`AI navigation summary generated: "${text.substring(0, 60)}..."`);
    } catch (err: any) {
      this.logger.warn(`AI summary generation failed: ${err?.message}`);
    }
  }

  getAiSummary(): { summary: string | null; cachedAt: string | null } {
    return {
      summary: this.cachedAiSummary,
      cachedAt: this.aiSummaryCachedAt?.toISOString() || null,
    };
  }
}
