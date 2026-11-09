import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/app-config.service.js';

type ReconnectListener = () => void | Promise<void>;

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);
  private readonly reconnectListeners: ReconnectListener[] = [];
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

  onReconnect(listener: ReconnectListener): void {
    this.reconnectListeners.push(listener);
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
    const reconnected = this.connectedOnce;
    this.connectedOnce = true;
    this.down = false;
    this.logger.log(reconnected ? 'Redis connection restored' : 'Redis connected');
    if (!reconnected) {
      return;
    }
    for (const listener of this.reconnectListeners) {
      Promise.resolve()
        .then(listener)
        .catch((error: unknown) => this.logger.error('Redis reconnect handler failed', error));
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
