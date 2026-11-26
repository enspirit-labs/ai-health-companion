import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { RequestUser } from '../decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'SUPPORT';
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  validate(payload: JwtPayload): RequestUser {
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
