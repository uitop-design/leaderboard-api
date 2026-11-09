export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  score: number;
}

export interface BestScore {
  playerName: string;
  value: number;
  achievedAt: Date;
}

export interface RankedScore {
  playerName: string;
  value: number;
  achievedAt: number;
}

export function rankScores(scores: RankedScore[], limit: number): LeaderboardEntry[] {
  const sorted = scores.toSorted(
    (a, b) =>
      b.value - a.value ||
      a.achievedAt - b.achievedAt ||
      compareNames(a.playerName.toLowerCase(), b.playerName.toLowerCase()),
  );
  const entries: LeaderboardEntry[] = [];
  for (const [index, score] of sorted.entries()) {
    const previous = entries[index - 1];
    const rank = previous && previous.score === score.value ? previous.rank : index + 1;
    entries.push({ rank, playerName: score.playerName, score: score.value });
  }
  return entries.slice(0, limit);
}

function compareNames(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
