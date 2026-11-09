import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { BestScore, LeaderboardEntry } from './leaderboard.types.js';

interface TopRow {
  rank: number;
  playerName: string;
  value: number;
}

@Injectable()
export class PostgresRanking {
  constructor(private readonly prisma: PrismaService) {}

  bestScores(gameId: string): Promise<BestScore[]> {
    return this.prisma.$queryRaw<BestScore[]>`
      SELECT DISTINCT ON (lower(player_name))
        player_name AS "playerName", value, created_at AS "achievedAt"
      FROM scores
      WHERE game_id = ${gameId}::uuid
      ORDER BY lower(player_name), value DESC, created_at ASC, id ASC
    `;
  }

  async top(gameId: string, limit: number): Promise<LeaderboardEntry[]> {
    const rows = await this.prisma.$queryRaw<TopRow[]>`
      WITH best AS (
        SELECT DISTINCT ON (lower(player_name)) player_name, value, created_at
        FROM scores
        WHERE game_id = ${gameId}::uuid
        ORDER BY lower(player_name), value DESC, created_at ASC, id ASC
      )
      SELECT
        RANK() OVER (ORDER BY value DESC)::int AS rank,
        player_name AS "playerName",
        value
      FROM best
      ORDER BY value DESC, created_at ASC, lower(player_name) COLLATE "C" ASC
      LIMIT ${limit}
    `;
    return rows.map(({ rank, playerName, value }) => ({ rank, playerName, score: value }));
  }

  async rankForScore(gameId: string, value: number): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ higher: number }[]>`
      SELECT COUNT(*)::int AS higher
      FROM (
        SELECT 1
        FROM scores
        WHERE game_id = ${gameId}::uuid
        GROUP BY lower(player_name)
        HAVING MAX(value) > ${value}
      ) AS better_players
    `;
    return (row?.higher ?? 0) + 1;
  }
}
