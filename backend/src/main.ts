import * as dotenv from 'dotenv';
dotenv.config({ override: true });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import * as bodyParser from 'body-parser';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Body size limit (for base64 images)
  // Store raw body buffer for webhook signature verification
  app.use(bodyParser.json({
    limit: '100mb',
    verify: (req: any, res, buf) => { req.rawBody = buf; },
  }));
  app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }));

  // Security
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: false,
  }));
  app.use(compression());
  app.enableCors({
    origin: [
      'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:3004',
      'http://173.212.227.106', 'http://173.212.227.106:3001', 'http://173.212.227.106:3002', 'http://173.212.227.106:3003', 'http://173.212.227.106:3004',
      'https://marinaprizeclub.com.br', 'https://admin.prizeclube.com.br',
      'https://marinaprizeclub.com', 'https://www.marinaprizeclub.com',
      'https://app.marinaprizeclub.com', 'https://admin.marinaprizeclub.com', 'https://garcom.marinaprizeclub.com',
    ],
    credentials: true,
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Prize Clube API')
    .setDescription('API para gestão de marina - cotas, reservas, financeiro, IA')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Autenticação e registro')
    .addTag('users', 'Gestão de usuários')
    .addTag('boats', 'Embarcações')
    .addTag('shares', 'Cotas')
    .addTag('reservations', 'Reservas')
    .addTag('finance', 'Financeiro')
    .addTag('fuel', 'Combustível')
    .addTag('maintenance', 'Manutenção')
    .addTag('operations', 'Operações')
    .addTag('queue', 'Fila de descida')
    .addTag('ai', 'IA Gemini')
    .addTag('notifications', 'Notificações')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Static files (e.g. default avatar)
  app.use('/static', express.static(join(process.cwd(), 'public')));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚤 Prize Clube API running on port ${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
