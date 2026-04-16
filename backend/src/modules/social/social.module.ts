import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialGateway } from './social.gateway';

@Module({
  imports: [ConfigModule],
  controllers: [SocialController],
  providers: [SocialService, SocialGateway],
  exports: [SocialService],
})
export class SocialModule {}
