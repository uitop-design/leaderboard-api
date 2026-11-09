import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { Namespace, Socket } from 'socket.io';
import type { GamesService } from '../games/games.service.js';
import type { LeaderboardService } from '../leaderboard/leaderboard.service.js';
import type { LeaderboardEntry } from '../leaderboard/leaderboard.types.js';
import { asyncFn } from '../test/mocks.js';
import { RealtimeService } from './realtime.service.js';

const game = { id: 'game-id', slug: 'space-runner' };
const top: LeaderboardEntry[] = [
  { rank: 1, playerName: 'Nova', score: 500 },
  { rank: 2, playerName: 'Orbit', score: 400 },
];

describe('RealtimeService', () => {
  let games: { findBySlug: jest.Mock };
  let leaderboard: { top: jest.Mock };
  let emit: jest.Mock;
  let to: jest.Mock;
  let rooms: Map<string, Set<string>>;
  let service: RealtimeService;

  beforeEach(() => {
    games = { findBySlug: asyncFn().mockResolvedValue(game) };
    leaderboard = { top: asyncFn<LeaderboardEntry[]>().mockResolvedValue(top) };
    emit = jest.fn();
    to = jest.fn(() => ({ emit }));
    rooms = new Map([['game:space-runner', new Set(['socket-1'])]]);
    service = new RealtimeService(
      games as unknown as GamesService,
      leaderboard as unknown as LeaderboardService,
    );
    service.attach({ to, adapter: { rooms } } as unknown as Namespace);
  });

  describe('publishNewBest', () => {
    it('broadcasts the top 10 to the game room when the player enters it', async () => {
      await service.publishNewBest(game.id, game.slug, 'orbit');

      expect(leaderboard.top).toHaveBeenCalledWith(game.id, 10);
      expect(to).toHaveBeenCalledWith('game:space-runner');
      expect(emit).toHaveBeenCalledWith('leaderboard', { slug: game.slug, leaderboard: top });
    });

    it('stays silent when the player is outside the top 10', async () => {
      await service.publishNewBest(game.id, game.slug, 'Comet');

      expect(emit).not.toHaveBeenCalled();
    });

    it('skips reading the leaderboard when nobody is subscribed', async () => {
      rooms.clear();

      await service.publishNewBest(game.id, game.slug, 'Nova');

      expect(leaderboard.top).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('subscriptions', () => {
    it('joins the game room and acknowledges with the current top 10', async () => {
      const join = asyncFn<void>().mockResolvedValue(undefined);

      const ack = await service.subscribe({ join } as unknown as Socket, game.slug);

      expect(join).toHaveBeenCalledWith('game:space-runner');
      expect(ack).toEqual({ ok: true, slug: game.slug, leaderboard: top });
    });

    it('does not join a room of an unknown game', async () => {
      games.findBySlug.mockRejectedValue(new NotFoundException() as never);
      const join = asyncFn<void>();

      await expect(
        service.subscribe({ join } as unknown as Socket, 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(join).not.toHaveBeenCalled();
    });

    it('leaves the game room on unsubscribe', async () => {
      const leave = asyncFn<void>().mockResolvedValue(undefined);

      await expect(service.unsubscribe({ leave } as unknown as Socket, game.slug)).resolves.toEqual(
        {
          ok: true,
          slug: game.slug,
        },
      );
      expect(leave).toHaveBeenCalledWith('game:space-runner');
    });
  });
});
