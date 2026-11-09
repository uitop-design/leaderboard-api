import { Injectable } from '@nestjs/common';
import type { Namespace, Socket } from 'socket.io';
import { GamesService } from '../games/games.service.js';
import { LeaderboardService } from '../leaderboard/leaderboard.service.js';
import type { LeaderboardEntry } from '../leaderboard/leaderboard.types.js';

export const LIVE_TOP_SIZE = 10;
export const LEADERBOARD_EVENT = 'leaderboard';

export interface LeaderboardUpdate {
  slug: string;
  leaderboard: LeaderboardEntry[];
}

export interface SubscribeAck extends LeaderboardUpdate {
  ok: true;
}

export interface UnsubscribeAck {
  ok: true;
  slug: string;
}

@Injectable()
export class RealtimeService {
  private server: Namespace | null = null;

  constructor(
    private readonly games: GamesService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  attach(server: Namespace): void {
    this.server = server;
  }

  async subscribe(client: Socket, slug: string): Promise<SubscribeAck> {
    const game = await this.games.findBySlug(slug);
    const leaderboard = await this.leaderboard.top(game.id, LIVE_TOP_SIZE);
    await client.join(roomOf(slug));
    return { ok: true, slug, leaderboard };
  }

  async unsubscribe(client: Socket, slug: string): Promise<UnsubscribeAck> {
    await client.leave(roomOf(slug));
    return { ok: true, slug };
  }

  async publishNewBest(gameId: string, slug: string, playerName: string): Promise<void> {
    const room = roomOf(slug);
    if (!this.server?.adapter.rooms.get(room)?.size) {
      return;
    }
    const leaderboard = await this.leaderboard.top(gameId, LIVE_TOP_SIZE);
    const player = playerName.toLowerCase();
    if (!leaderboard.some((entry) => entry.playerName.toLowerCase() === player)) {
      return;
    }
    const update: LeaderboardUpdate = { slug, leaderboard };
    this.server.to(room).emit(LEADERBOARD_EVENT, update);
  }
}

function roomOf(slug: string): string {
  return `game:${slug}`;
}
