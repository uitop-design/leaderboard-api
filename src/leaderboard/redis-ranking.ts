import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';
import { PostgresRanking } from './postgres-ranking.js';
import {
  rankScores,
  type BestScore,
  type LeaderboardEntry,
  type RankedScore,
} from './leaderboard.types.js';

const KEY_PREFIX = 'leaderboard:';

const UPSERT_BEST_SCRIPT = `
local changed = redis.call('ZADD', KEYS[1], 'GT', 'CH', ARGV[1], ARGV[2])
if changed == 1 or redis.call('HEXISTS', KEYS[2], ARGV[2]) == 0 then
  redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
end
return changed
`;

interface PlayerMeta {
  name: string;
  at: number;
}

@Injectable()
export class RedisRanking {
  constructor(
    private readonly redis: RedisService,
    private readonly postgres: PostgresRanking,
  ) {}

  get isAvailable(): boolean {
    return this.redis.isReady;
  }

  async record(gameId: string, score: BestScore): Promise<void> {
    await this.ensure(gameId);
    const keys = this.keys(gameId);
    await this.redis.client.eval(
      UPSERT_BEST_SCRIPT,
      2,
      keys.scores,
      keys.players,
      ...this.args(score),
    );
  }

  async top(gameId: string, limit: number): Promise<LeaderboardEntry[]> {
    await this.ensure(gameId);
    const keys = this.keys(gameId);
    const head = await this.redis.client.zrevrange(keys.scores, 0, limit - 1, 'WITHSCORES');
    const cutoff = head.at(-1);
    if (cutoff === undefined) {
      return [];
    }
    const ranked = await this.redis.client.zrange(
      keys.scores,
      '+inf',
      cutoff,
      'BYSCORE',
      'REV',
      'WITHSCORES',
    );
    const members = ranked.filter((_, index) => index % 2 === 0);
    const meta = await this.redis.client.hmget(keys.players, ...members);
    const scores: RankedScore[] = members.map((member, index) => {
      const player = parseMeta(meta[index]);
      return {
        playerName: player?.name ?? member,
        value: Number(ranked[index * 2 + 1]),
        achievedAt: player?.at ?? Number.MAX_SAFE_INTEGER,
      };
    });
    return rankScores(scores, limit);
  }

  async rankForScore(gameId: string, value: number): Promise<number> {
    await this.ensure(gameId);
    const higher = await this.redis.client.zcount(this.keys(gameId).scores, `(${value}`, '+inf');
    return higher + 1;
  }

  async drop(gameId: string): Promise<void> {
    const keys = this.keys(gameId);
    await this.redis.client.unlink(keys.scores, keys.players);
  }

  async dropAll(): Promise<void> {
    const stream = this.redis.client.scanStream({ match: `${KEY_PREFIX}*`, count: 200 });
    for await (const batch of stream) {
      const keys = batch as string[];
      if (keys.length > 0) {
        await this.redis.client.unlink(...keys);
      }
    }
  }

  private async ensure(gameId: string): Promise<void> {
    const keys = this.keys(gameId);
    if ((await this.redis.client.exists(keys.scores, keys.players)) === 2) {
      return;
    }
    const scores = await this.postgres.bestScores(gameId);
    if (scores.length === 0) {
      return;
    }
    const pipeline = this.redis.client.pipeline();
    for (const score of scores) {
      pipeline.eval(UPSERT_BEST_SCRIPT, 2, keys.scores, keys.players, ...this.args(score));
    }
    const results = (await pipeline.exec()) ?? [];
    const failure = results.find(([error]) => error !== null)?.[0];
    if (failure) {
      throw failure;
    }
  }

  private keys(gameId: string): { scores: string; players: string } {
    return {
      scores: `${KEY_PREFIX}${gameId}:scores`,
      players: `${KEY_PREFIX}${gameId}:players`,
    };
  }

  private args(score: BestScore): [number, string, string] {
    const meta: PlayerMeta = { name: score.playerName, at: score.achievedAt.getTime() };
    return [score.value, score.playerName.toLowerCase(), JSON.stringify(meta)];
  }
}

function parseMeta(raw: string | null | undefined): PlayerMeta | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'name' in parsed &&
      'at' in parsed &&
      typeof parsed.name === 'string' &&
      typeof parsed.at === 'number'
    ) {
      return { name: parsed.name, at: parsed.at };
    }
  } catch {
    return null;
  }
  return null;
}
