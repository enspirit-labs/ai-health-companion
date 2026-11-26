import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  ForgotPasswordSchema,
  LoginSchema,
  RefreshTokenSchema,
  ResetPasswordSchema,
  SignupSchema,
  UpdateTimezoneSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RefreshTokenInput,
  type ResetPasswordInput,
  type SignupInput,
  type UpdateTimezoneInput,
} from '@aidoctor/shared';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthCredentialThrottleGuard } from '../common/throttle/auth-credential-throttle.guard';
import { AuthThrottle } from '../common/throttle/auth-throttle.decorator';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser, type RequestUser } from './decorators/current-user.decorator';

function requestMeta(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Per-credential budget instead of the global IP throttle (see AuthCredentialThrottleGuard).
  @SkipThrottle()
  @AuthThrottle('signup')
  @UseGuards(AuthCredentialThrottleGuard)
  @Post('signup')
  async signup(@Body(new ZodValidationPipe(SignupSchema)) body: SignupInput, @Req() req: Request) {
    return this.authService.signup(body, requestMeta(req));
  }

  @Public()
  // Per-credential budget instead of the global IP throttle (see AuthCredentialThrottleGuard).
  @SkipThrottle()
  @AuthThrottle('login')
  @UseGuards(AuthCredentialThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body(new ZodValidationPipe(LoginSchema)) body: LoginInput, @Req() req: Request) {
    return this.authService.login(body, requestMeta(req));
  }

  @Public()
  // Per-credential budget instead of the global IP throttle (see AuthCredentialThrottleGuard).
  @SkipThrottle()
  @AuthThrottle('refresh')
  @UseGuards(AuthCredentialThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Body(new ZodValidationPipe(RefreshTokenSchema)) body: RefreshTokenInput) {
    return this.authService.refresh(body.refreshToken);
  }

  @Public()
  // Per-credential budget instead of the global IP throttle (see AuthCredentialThrottleGuard).
  @SkipThrottle()
  @AuthThrottle('forgot-password')
  @UseGuards(AuthCredentialThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body(new ZodValidationPipe(ForgotPasswordSchema)) body: ForgotPasswordInput) {
    const result = await this.authService.forgotPassword(body.email);
    return { message: 'If an account exists for this email, a reset link has been sent.', ...result };
  }

  @Public()
  // Per-credential budget instead of the global IP throttle (see AuthCredentialThrottleGuard).
  @SkipThrottle()
  @AuthThrottle('reset-password')
  @UseGuards(AuthCredentialThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordInput) {
    await this.authService.resetPassword({
      email: body.email,
      token: body.token,
      newPassword: body.password,
    });
    return { message: 'Password updated successfully.' };
  }

  @ApiBearerAuth()
  @Get('me')
  async me(@CurrentUser() user: RequestUser) {
    return this.authService.getMe(user.id);
  }

  @ApiBearerAuth()
  @Patch('me')
  async updateMe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(UpdateTimezoneSchema)) body: UpdateTimezoneInput,
  ) {
    return this.authService.updateTimezone(user.id, body.timezone);
  }

  // Public + refresh-token based: possession of the refresh token is the
  // proof, and it must still work once the short-lived access token expired.
  @Public()
  // Per-credential budget instead of the global IP throttle (see AuthCredentialThrottleGuard).
  @SkipThrottle()
  @AuthThrottle('logout')
  @UseGuards(AuthCredentialThrottleGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Body(new ZodValidationPipe(RefreshTokenSchema)) body: RefreshTokenInput, @Req() req: Request) {
    await this.authService.logout(body.refreshToken, requestMeta(req));
    return { message: 'Logged out.' };
  }
}
