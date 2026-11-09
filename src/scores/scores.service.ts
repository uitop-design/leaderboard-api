import { Injectable, NotFoundException } from '@nestjs/common';
import { GamesService } from '../games/games.service.js';
import type { LeaderboardEntry } from '../leaderboard/leaderboard.types.js';
import { LeaderboardService } from '../leaderboard/leaderboard.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import type { SubmitScoreDto } from './dto/score.dto.js';

export interface SubmittedScore {
  id: string;
  playerName: string;
  value: number;
  createdAt: Date;
}

export interface SubmitScoreResult {
  score: SubmittedScore;
  best: number;
  rank: number;
  isPersonalBest: boolean;
}

export interface PlayerStanding {
  playerName: string;
  best: number;
  rank: number;
  scoresCount: number;
}

@Injectable()
export class ScoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
    private readonly leaderboard: LeaderboardService,
    private readonly realtime: RealtimeService,
  ) {}

  async submit(slug: string, dto: SubmitScoreDto): Promise<SubmitScoreResult> {
    const game = await this.games.findBySlug(slug);
    const score = await this.prisma.score.create({
      data: { gameId: game.id, playerName: dto.playerName, value: dto.value },
      select: { id: true, playerName: true, value: true, createdAt: true },
    });
    const [stats] = await this.prisma.$queryRaw<{ best: number; matched: number }[]>`
      SELECT
        MAX(value) AS best,
        COUNT(*) FILTER (
          WHERE id <> ${score.id}::uuid AND value >= ${score.value} AND created_at <= ${score.createdAt}
        )::int AS matched
      FROM scores
      WHERE game_id = ${game.id}::uuid AND lower(player_name) = lower(${score.playerName})
    `;
    const best = stats?.best ?? score.value;
    await this.leaderboard.record(game.id, {
      playerName: score.playerName,
      value: score.value,
      achievedAt: score.createdAt,
    });
    const rank = await this.leaderboard.rankForScore(game.id, best);
    const isPersonalBest = stats?.matched === 0;
    if (isPersonalBest) {
      await this.realtime.publishNewBest(game.id, game.slug, score.playerName);
    }
    return { score, best, rank, isPersonalBest };
  }

  async leaderboardOf(slug: string, limit: number): Promise<LeaderboardEntry[]> {
    const game = await this.games.findBySlug(slug);
    return this.leaderboard.top(game.id, limit);
  }

  async standing(slug: string, playerName: string): Promise<PlayerStanding> {
    const game = await this.games.findBySlug(slug);
    const [player] = await this.prisma.$queryRaw<Omit<PlayerStanding, 'rank'>[]>`
      SELECT
        (ARRAY_AGG(player_name ORDER BY value DESC, created_at ASC, id ASC))[1] AS "playerName",
        MAX(value) AS best,
        COUNT(*)::int AS "scoresCount"
      FROM scores
      WHERE game_id = ${game.id}::uuid AND lower(player_name) = lower(${playerName})
    `;
    if (!player?.scoresCount) {
      throw new NotFoundException(`Player "${playerName}" has no scores in game "${slug}"`);
    }
    const rank = await this.leaderboard.rankForScore(game.id, player.best);
    return {
      playerName: player.playerName,
      best: player.best,
      rank,
      scoresCount: player.scoresCount,
    };
  }
}
