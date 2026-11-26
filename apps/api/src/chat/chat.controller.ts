import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SendChatMessageSchema, type SendChatMessageInput } from '@aidoctor/shared';

import { AiThrottle } from '../common/throttle/ai-throttle.decorator';
import { AiUserThrottleGuard } from '../common/throttle/ai-user-throttle.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { parsePositiveInt } from '../common/pagination.util';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { ChatService } from './chat.service';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /** the signed-in user's conversations, most recently active first. */
  @Get('sessions')
  listSessions(@CurrentUser() user: RequestUser, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.chatService.listSessions(user.id, { page: parsePositiveInt(page), limit: parsePositiveInt(limit) });
  }

  /** start a new conversation. */
  @Post('sessions')
  createSession(@CurrentUser() user: RequestUser) {
    return this.chatService.createSession(user.id);
  }

  /** read one previous conversation back, in order. */
  @Get('sessions/:id/messages')
  getSessionMessages(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getSessionMessages(user.id, id, {
      page: parsePositiveInt(page),
      limit: parsePositiveInt(limit),
    });
  }

  /** continue a specific conversation. Per-user AI budget. */
  @UseGuards(AiUserThrottleGuard)
  @AiThrottle('chat')
  @Post('sessions/:id/messages')
  sendMessageToSession(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SendChatMessageSchema)) body: SendChatMessageInput,
  ) {
    return this.chatService.sendMessageToSession(user.id, id, body.content);
  }

  /**
   * Session-unaware history/send, operating on whichever session the user was
   * last active in (created on demand). Kept for callers that don't manage
   * sessions themselves; the session-scoped routes above are the richer path.
   */
  @Get('messages')
  getHistory(@CurrentUser() user: RequestUser, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.chatService.getHistory(user.id, { page: parsePositiveInt(page), limit: parsePositiveInt(limit) });
  }

  // Per-user AI budget, shared with the session-scoped send above.
  @UseGuards(AiUserThrottleGuard)
  @AiThrottle('chat')
  @Post('messages')
  sendMessage(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(SendChatMessageSchema)) body: SendChatMessageInput,
  ) {
    return this.chatService.sendMessage(user.id, body.content);
  }
}
