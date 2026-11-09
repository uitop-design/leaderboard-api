import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';
import type { BestScore, LeaderboardEntry } from './leaderboard.types.js';
import { PostgresRanking } from './postgres-ranking.js';
import { RedisRanking } from './redis-ranking.js';

@Injectable()
export class LeaderboardService implements OnModuleInit {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    private readonly redisRanking: RedisRanking,
    private readonly postgresRanking: PostgresRanking,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    this.redis.onReconnect(() => this.redisRanking.dropAll());
  }

  async record(gameId: string, score: BestScore): Promise<void> {
    if (!this.redisRanking.isAvailable) {
      return;
    }
    try {
      await this.redisRanking.record(gameId, score);
    } catch (error) {
      this.warn('record score', error);
      await this.drop(gameId);
    }
  }

  top(gameId: string, limit: number): Promise<LeaderboardEntry[]> {
    return this.withFallback(
      'read leaderboard',
      () => this.redisRanking.top(gameId, limit),
      () => this.postgresRanking.top(gameId, limit),
    );
  }

  rankForScore(gameId: string, value: number): Promise<number> {
    return this.withFallback(
      'read rank',
      () => this.redisRanking.rankForScore(gameId, value),
      () => this.postgresRanking.rankForScore(gameId, value),
    );
  }

  async drop(gameId: string): Promise<void> {
    if (!this.redisRanking.isAvailable) {
      return;
    }
    try {
      await this.redisRanking.drop(gameId);
    } catch (error) {
      this.warn('drop leaderboard', error);
    }
  }

  private async withFallback<T>(
    operation: string,
    fromRedis: () => Promise<T>,
    fromPostgres: () => Promise<T>,
  ): Promise<T> {
    if (!this.redisRanking.isAvailable) {
      return fromPostgres();
    }
    try {
      return await fromRedis();
    } catch (error) {
      this.warn(operation, error);
      return fromPostgres();
    }
  }

  private warn(operation: string, error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Redis failed to ${operation}, using Postgres: ${reason}`);
  }
}
