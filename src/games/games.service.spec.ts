import { beforeEach, describe, expect, it } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { buildErrorBody } from '../common/errors/error-body.js';
import { Prisma } from '../generated/prisma/client.js';
import { LeaderboardService } from '../leaderboard/leaderboard.service.js';
import { PostgresRanking } from '../leaderboard/postgres-ranking.js';
import { RedisRanking } from '../leaderboard/redis-ranking.js';
import { createPrismaMock, createRedisMock } from '../test/mocks.js';
import { GamesService } from './games.service.js';

const game = {
  id: '01a1c467-42b6-715d-96b6-b753a8c859e0',
  slug: 'space-runner',
  name: 'Space Runner',
  createdAt: new Date('2026-11-09T10:00:00Z'),
  updatedAt: new Date('2026-11-09T10:00:00Z'),
};

describe('GamesService', () => {
  let prisma: ReturnType<typeof createPrismaMock>['mock'];
  let redis: ReturnType<typeof createRedisMock>['mock'];
  let service: GamesService;

  beforeEach(() => {
    const prismaMock = createPrismaMock();
    const redisMock = createRedisMock();
    prisma = prismaMock.mock;
    redis = redisMock.mock;
    const postgresRanking = new PostgresRanking(prismaMock.service);
    const leaderboard = new LeaderboardService(
      new RedisRanking(redisMock.service, postgresRanking),
      postgresRanking,
      redisMock.service,
    );
    service = new GamesService(prismaMock.service, leaderboard);
  });

  describe('create', () => {
    it('creates a game', async () => {
      prisma.game.create.mockResolvedValue(game as never);

      await expect(service.create({ slug: game.slug, name: game.name })).resolves.toBe(game);
      expect(prisma.game.create).toHaveBeenCalledWith({
        data: { slug: 'space-runner', name: 'Space Runner' },
      });
    });

    it('rejects a taken slug with a conflict', async () => {
      const uniqueViolation = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: Prisma.prismaVersion.client,
      });
      prisma.game.create.mockRejectedValue(uniqueViolation as never);

      const error = await service.create({ slug: game.slug, name: 'Other' }).catch((e) => e);

      expect(error).toBe(uniqueViolation);
      expect(buildErrorBody(error, '/api/games')).toMatchObject({
        statusCode: 409,
        error: 'Conflict',
      });
    });
  });

  describe('remove', () => {
    it('deletes the game and its Redis keys', async () => {
      prisma.game.findUnique.mockResolvedValue(game as never);
      prisma.game.delete.mockResolvedValue(game as never);

      await service.remove(game.slug);

      expect(prisma.game.delete).toHaveBeenCalledWith({ where: { id: game.id } });
      expect(redis.client.unlink).toHaveBeenCalledWith(
        `leaderboard:${game.id}:scores`,
        `leaderboard:${game.id}:players`,
      );
    });

    it('still deletes the game when Redis is unavailable', async () => {
      redis.isReady = false;
      prisma.game.findUnique.mockResolvedValue(game as never);
      prisma.game.delete.mockResolvedValue(game as never);

      await service.remove(game.slug);

      expect(prisma.game.delete).toHaveBeenCalled();
      expect(redis.client.unlink).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown game without touching Redis', async () => {
      prisma.game.findUnique.mockResolvedValue(null as never);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.game.delete).not.toHaveBeenCalled();
      expect(redis.client.unlink).not.toHaveBeenCalled();
    });
  });
});
