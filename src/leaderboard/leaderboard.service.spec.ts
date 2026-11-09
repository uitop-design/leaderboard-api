import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { asyncFn, createRedisMock, type AsyncMock } from '../test/mocks.js';
import { LeaderboardService } from './leaderboard.service.js';
import type { LeaderboardEntry } from './leaderboard.types.js';
import type { PostgresRanking } from './postgres-ranking.js';
import type { RedisRanking } from './redis-ranking.js';

const GAME_ID = 'game-id';
const postgresTop: LeaderboardEntry[] = [{ rank: 1, playerName: 'Nova', score: 10 }];
const redisTop: LeaderboardEntry[] = [{ rank: 1, playerName: 'Orbit', score: 20 }];

describe('LeaderboardService', () => {
  let redisRanking: {
    isAvailable: boolean;
    record: AsyncMock<void>;
    top: AsyncMock<LeaderboardEntry[]>;
    rankForScore: AsyncMock<number>;
    drop: AsyncMock<void>;
    dropAll: AsyncMock<void>;
  };
  let postgresRanking: {
    top: AsyncMock<LeaderboardEntry[]>;
    rankForScore: AsyncMock<number>;
  };
  let redis: ReturnType<typeof createRedisMock>['mock'];
  let service: LeaderboardService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    redisRanking = {
      isAvailable: true,
      record: asyncFn<void>().mockResolvedValue(undefined),
      top: asyncFn<LeaderboardEntry[]>().mockResolvedValue(redisTop),
      rankForScore: asyncFn<number>().mockResolvedValue(3),
      drop: asyncFn<void>().mockResolvedValue(undefined),
      dropAll: asyncFn<void>().mockResolvedValue(undefined),
    };
    postgresRanking = {
      top: asyncFn<LeaderboardEntry[]>().mockResolvedValue(postgresTop),
      rankForScore: asyncFn<number>().mockResolvedValue(7),
    };
    const redisMock = createRedisMock();
    redis = redisMock.mock;
    service = new LeaderboardService(
      redisRanking as unknown as RedisRanking,
      postgresRanking as unknown as PostgresRanking,
      redisMock.service,
    );
  });

  it('serves the leaderboard from Redis when it is available', async () => {
    await expect(service.top(GAME_ID, 10)).resolves.toBe(redisTop);
    expect(postgresRanking.top).not.toHaveBeenCalled();
  });

  describe('without Redis', () => {
    beforeEach(() => {
      redisRanking.isAvailable = false;
    });

    it('computes the leaderboard and ranks in Postgres', async () => {
      await expect(service.top(GAME_ID, 10)).resolves.toBe(postgresTop);
      await expect(service.rankForScore(GAME_ID, 5)).resolves.toBe(7);
      expect(redisRanking.top).not.toHaveBeenCalled();
      expect(redisRanking.rankForScore).not.toHaveBeenCalled();
    });

    it('skips recording scores in Redis', async () => {
      await service.record(GAME_ID, { playerName: 'Nova', value: 1, achievedAt: new Date() });

      expect(redisRanking.record).not.toHaveBeenCalled();
    });
  });

  it('falls back to Postgres when a Redis command fails', async () => {
    redisRanking.top.mockRejectedValue(new Error('Command timed out'));
    redisRanking.rankForScore.mockRejectedValue(new Error('Command timed out'));

    await expect(service.top(GAME_ID, 10)).resolves.toBe(postgresTop);
    await expect(service.rankForScore(GAME_ID, 5)).resolves.toBe(7);
  });

  it('drops the cached ranking when recording a score fails', async () => {
    redisRanking.record.mockRejectedValue(new Error('Connection reset'));

    await expect(
      service.record(GAME_ID, { playerName: 'Nova', value: 1, achievedAt: new Date() }),
    ).resolves.toBeUndefined();
    expect(redisRanking.drop).toHaveBeenCalledWith(GAME_ID);
  });

  it('drops every cached ranking when Redis recovers', async () => {
    service.onModuleInit();
    const [listener] = redis.onRecovery.mock.calls[0] as [() => Promise<void>];

    await listener();

    expect(redisRanking.dropAll).toHaveBeenCalled();
  });
});
