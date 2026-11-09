import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/app-config.service.js';

type RecoveryListener = () => void | Promise<void>;

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);
  private readonly recoveryListeners: RecoveryListener[] = [];
  private connectedOnce = false;
  private down = false;

  constructor(config: AppConfigService) {
    this.client = new Redis(config.get('REDIS_URL'), {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      commandTimeout: 1000,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
    });
    this.client.on('ready', () => this.handleReady());
    this.client.on('error', (error: Error) => this.markDown(error.message));
    this.client.on('close', () => this.markDown('connection closed'));
  }

  get isReady(): boolean {
    return this.client.status === 'ready';
  }

  onRecovery(listener: RecoveryListener): void {
    this.recoveryListeners.push(listener);
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  private handleReady(): void {
    const recovered = this.down;
    this.logger.log(this.connectedOnce ? 'Redis connection restored' : 'Redis connected');
    this.connectedOnce = true;
    this.down = false;
    if (!recovered) {
      return;
    }
    for (const listener of this.recoveryListeners) {
      Promise.resolve()
        .then(listener)
        .catch((error: unknown) => this.logger.error('Redis recovery handler failed', error));
    }
  }

  private markDown(reason: string): void {
    if (this.down) {
      return;
    }
    this.down = true;
    this.logger.warn(`Redis unavailable: ${reason}`);
  }
}
