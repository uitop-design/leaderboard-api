import { describe, expect, it } from '@jest/globals';
import { rankScores } from './leaderboard.types.js';

describe('rankScores', () => {
  it('assigns competition ranks so equal scores share a rank', () => {
    const entries = rankScores(
      [
        { playerName: 'Dee', value: 50, achievedAt: 4 },
        { playerName: 'Bob', value: 200, achievedAt: 2 },
        { playerName: 'Ann', value: 300, achievedAt: 1 },
        { playerName: 'Cid', value: 200, achievedAt: 3 },
      ],
      10,
    );

    expect(entries).toEqual([
      { rank: 1, playerName: 'Ann', score: 300 },
      { rank: 2, playerName: 'Bob', score: 200 },
      { rank: 2, playerName: 'Cid', score: 200 },
      { rank: 4, playerName: 'Dee', score: 50 },
    ]);
  });

  it('lists the player who reached a tied score first', () => {
    const entries = rankScores(
      [
        { playerName: 'Late', value: 100, achievedAt: 20 },
        { playerName: 'Early', value: 100, achievedAt: 10 },
      ],
      10,
    );

    expect(entries.map((entry) => entry.playerName)).toEqual(['Early', 'Late']);
    expect(entries.map((entry) => entry.rank)).toEqual([1, 1]);
  });

  it('keeps ranks computed over the whole list when cutting inside a tie', () => {
    const entries = rankScores(
      [
        { playerName: 'Ann', value: 9, achievedAt: 1 },
        { playerName: 'Bob', value: 5, achievedAt: 2 },
        { playerName: 'Cid', value: 5, achievedAt: 3 },
        { playerName: 'Dee', value: 5, achievedAt: 4 },
      ],
      3,
    );

    expect(entries).toEqual([
      { rank: 1, playerName: 'Ann', score: 9 },
      { rank: 2, playerName: 'Bob', score: 5 },
      { rank: 2, playerName: 'Cid', score: 5 },
    ]);
  });
});
