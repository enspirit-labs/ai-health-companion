import { Module } from '@nestjs/common';

import { AiThrottleModule } from '../common/throttle/ai-throttle.module';
import { AiModule } from '../ai/ai.module';
import { ConsentModule } from '../consent/consent.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AiModule, ConsentModule, AiThrottleModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
