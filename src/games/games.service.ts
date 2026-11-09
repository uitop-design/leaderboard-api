import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import type { Game } from '../generated/prisma/client.js';
import { LeaderboardService } from '../leaderboard/leaderboard.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateGameDto } from './dto/game.dto.js';

export interface GameListItem extends Game {
  playersCount: number;
}

export interface GameDetails extends Game {
  playersCount: number;
  scoresCount: number;
  topScore: number | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  create(dto: CreateGameDto): Promise<Game> {
    return this.prisma.game.create({ data: { slug: dto.slug, name: dto.name } });
  }

  async list({ page, limit }: PaginationQueryDto): Promise<Page<GameListItem>> {
    const [games, total] = await this.prisma.$transaction([
      this.prisma.game.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.game.count(),
    ]);
    const playersCounts = await this.playersCounts(games.map((game) => game.id));
    const items = games.map((game) => ({ ...game, playersCount: playersCounts.get(game.id) ?? 0 }));
    return { items, total, page, limit };
  }

  async findBySlug(slug: string): Promise<Game> {
    const game = await this.prisma.game.findUnique({ where: { slug } });
    if (!game) {
      throw new NotFoundException(`Game "${slug}" not found`);
    }
    return game;
  }

  async details(slug: string): Promise<GameDetails> {
    const game = await this.findBySlug(slug);
    const [stats] = await this.prisma.$queryRaw<Omit<GameDetails, keyof Game>[]>`
      SELECT
        COUNT(DISTINCT lower(player_name))::int AS "playersCount",
        COUNT(*)::int AS "scoresCount",
        MAX(value) AS "topScore"
      FROM scores
      WHERE game_id = ${game.id}::uuid
    `;
    return { ...game, playersCount: 0, scoresCount: 0, topScore: null, ...stats };
  }

  async remove(slug: string): Promise<void> {
    const game = await this.findBySlug(slug);
    await this.prisma.game.delete({ where: { id: game.id } });
    await this.leaderboard.drop(game.id);
  }

  private async playersCounts(gameIds: string[]): Promise<Map<string, number>> {
    if (gameIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.$queryRaw<{ gameId: string; count: number }[]>`
      SELECT game_id AS "gameId", COUNT(DISTINCT lower(player_name))::int AS count
      FROM scores
      WHERE game_id = ANY(${gameIds}::uuid[])
      GROUP BY game_id
    `;
    return new Map(rows.map((row) => [row.gameId, row.count]));
  }
}
