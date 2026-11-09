import { beforeEach, describe, expect, it } from '@jest/globals';
import { asyncFn, createRedisMock, meta, type AsyncMock } from '../test/mocks.js';
import type { BestScore } from './leaderboard.types.js';
import type { PostgresRanking } from './postgres-ranking.js';
import { RedisRanking } from './redis-ranking.js';

const GAME_ID = '01a1c467-42b6-715d-96b6-b753a8c859e0';
const SCORES_KEY = `leaderboard:${GAME_ID}:scores`;
const PLAYERS_KEY = `leaderboard:${GAME_ID}:players`;

describe('RedisRanking', () => {
  let redis: ReturnType<typeof createRedisMock>['mock'];
  let bestScores: AsyncMock<BestScore[]>;
  let ranking: RedisRanking;

  beforeEach(() => {
    const redisMock = createRedisMock();
    redis = redisMock.mock;
    bestScores = asyncFn<BestScore[]>();
    ranking = new RedisRanking(redisMock.service, { bestScores } as unknown as PostgresRanking);
  });

  describe('rebuild from Postgres', () => {
    it('restores missing keys from the best scores stored in Postgres', async () => {
      redis.client.exists.mockResolvedValue(0);
      bestScores.mockResolvedValue([
        { playerName: 'Nova', value: 300, achievedAt: new Date(1000) },
        { playerName: 'orbit', value: 200, achievedAt: new Date(2000) },
      ]);
      redis.pipeline.exec.mockResolvedValue([
        [null, 1],
        [null, 1],
      ]);
      redis.client.zcount.mockResolvedValue(1);

      const rank = await ranking.rankForScore(GAME_ID, 200);

      expect(bestScores).toHaveBeenCalledWith(GAME_ID);
      expect(redis.pipeline.eval).toHaveBeenCalledTimes(2);
      expect(redis.pipeline.eval).toHaveBeenCalledWith(
        expect.stringContaining("'GT'"),
        2,
        SCORES_KEY,
        PLAYERS_KEY,
        300,
        'nova',
        meta('Nova', 1000),
      );
      expect(redis.client.zcount).toHaveBeenCalledWith(SCORES_KEY, '(200', '+inf');
      expect(rank).toBe(2);
    });

    it('does not touch Postgres when both keys exist', async () => {
      redis.client.exists.mockResolvedValue(2);
      redis.client.zcount.mockResolvedValue(0);

      await expect(ranking.rankForScore(GAME_ID, 10)).resolves.toBe(1);
      expect(bestScores).not.toHaveBeenCalled();
    });

    it('fails when Redis rejects a rebuilt entry', async () => {
      redis.client.exists.mockResolvedValue(1);
      bestScores.mockResolvedValue([{ playerName: 'Nova', value: 1, achievedAt: new Date(0) }]);
      redis.pipeline.exec.mockResolvedValue([[new Error('OOM'), null]]);

      await expect(ranking.top(GAME_ID, 10)).rejects.toThrow('OOM');
    });
  });

  it('records a score with the lower-cased player as member', async () => {
    redis.client.exists.mockResolvedValue(2);
    redis.client.eval.mockResolvedValue(1);

    await ranking.record(GAME_ID, { playerName: 'NoVa', value: 42, achievedAt: new Date(5) });

    expect(redis.client.eval).toHaveBeenCalledWith(
      expect.any(String),
      2,
      SCORES_KEY,
      PLAYERS_KEY,
      42,
      'nova',
      meta('NoVa', 5),
    );
  });

  it('reads every player tied at the cut-off and ranks them with ties', async () => {
    redis.client.exists.mockResolvedValue(2);
    redis.client.zrevrange.mockResolvedValue(['ann', '300', 'cid', '200']);
    redis.client.zrange.mockResolvedValue(['ann', '300', 'cid', '200', 'bob', '200']);
    redis.client.hmget.mockResolvedValue([meta('Ann', 1), meta('Cid', 30), meta('Bob', 20)]);

    const top = await ranking.top(GAME_ID, 2);

    expect(redis.client.zrange).toHaveBeenCalledWith(
      SCORES_KEY,
      '+inf',
      '200',
      'BYSCORE',
      'REV',
      'WITHSCORES',
    );
    expect(top).toEqual([
      { rank: 1, playerName: 'Ann', score: 300 },
      { rank: 2, playerName: 'Bob', score: 200 },
    ]);
  });

  it('removes both keys of a game', async () => {
    await ranking.drop(GAME_ID);

    expect(redis.client.unlink).toHaveBeenCalledWith(SCORES_KEY, PLAYERS_KEY);
  });
});
