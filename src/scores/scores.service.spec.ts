import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { GamesService } from '../games/games.service.js';
import type { LeaderboardService } from '../leaderboard/leaderboard.service.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import { asyncFn, createPrismaMock } from '../test/mocks.js';
import { ScoresService } from './scores.service.js';

const game = { id: 'game-id', slug: 'space-runner', name: 'Space Runner' };
const createdAt = new Date('2026-11-09T12:00:00Z');

describe('ScoresService', () => {
  let prisma: ReturnType<typeof createPrismaMock>['mock'];
  let games: { findBySlug: jest.Mock };
  let leaderboard: { record: jest.Mock; rankForScore: jest.Mock; top: jest.Mock };
  let realtime: { publishNewBest: jest.Mock };
  let service: ScoresService;

  beforeEach(() => {
    const prismaMock = createPrismaMock();
    prisma = prismaMock.mock;
    games = { findBySlug: asyncFn().mockResolvedValue(game) };
    leaderboard = {
      record: asyncFn<void>().mockResolvedValue(undefined),
      rankForScore: asyncFn<number>().mockResolvedValue(2),
      top: asyncFn(),
    };
    realtime = { publishNewBest: asyncFn<void>().mockResolvedValue(undefined) };
    service = new ScoresService(
      prismaMock.service,
      games as unknown as GamesService,
      leaderboard as unknown as LeaderboardService,
      realtime as unknown as RealtimeService,
    );
  });

  function storeScore(playerName: string, value: number, stats: { best: number; matched: number }) {
    prisma.score.create.mockResolvedValue({
      id: 'score-id',
      playerName,
      value,
      createdAt,
    } as never);
    prisma.$queryRaw.mockResolvedValue([stats] as never);
  }

  it('reports a personal best, ranks it and broadcasts the leaderboard', async () => {
    storeScore('Nova', 500, { best: 500, matched: 0 });

    const result = await service.submit(game.slug, { playerName: 'Nova', value: 500 });

    expect(result).toEqual({
      score: { id: 'score-id', playerName: 'Nova', value: 500, createdAt },
      best: 500,
      rank: 2,
      isPersonalBest: true,
    });
    expect(prisma.score.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { gameId: game.id, playerName: 'Nova', value: 500 } }),
    );
    expect(leaderboard.record).toHaveBeenCalledWith(game.id, {
      playerName: 'Nova',
      value: 500,
      achievedAt: createdAt,
    });
    expect(leaderboard.rankForScore).toHaveBeenCalledWith(game.id, 500);
    expect(realtime.publishNewBest).toHaveBeenCalledWith(game.id, game.slug, 'Nova');
  });

  it('keeps the previous best when the score is not a personal best', async () => {
    storeScore('nova', 100, { best: 500, matched: 1 });

    const result = await service.submit(game.slug, { playerName: 'nova', value: 100 });

    expect(result.isPersonalBest).toBe(false);
    expect(result.best).toBe(500);
    expect(leaderboard.rankForScore).toHaveBeenCalledWith(game.id, 500);
    expect(realtime.publishNewBest).not.toHaveBeenCalled();
  });

  it('rejects a score for an unknown game', async () => {
    games.findBySlug.mockRejectedValue(new NotFoundException('Game "missing" not found') as never);

    await expect(
      service.submit('missing', { playerName: 'Nova', value: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.score.create).not.toHaveBeenCalled();
    expect(leaderboard.record).not.toHaveBeenCalled();
  });

  it('returns 404 for a player without scores', async () => {
    prisma.$queryRaw.mockResolvedValue([{ playerName: null, best: null, scoresCount: 0 }] as never);

    await expect(service.standing(game.slug, 'Ghost')).rejects.toBeInstanceOf(NotFoundException);
  });
});
