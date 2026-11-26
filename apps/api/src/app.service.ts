import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return { status: 'ok', service: 'ai-health-companion-api', timestamp: new Date().toISOString() };
  }
}
