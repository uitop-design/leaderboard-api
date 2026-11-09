import { Module } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service.js';
import { PostgresRanking } from './postgres-ranking.js';
import { RedisRanking } from './redis-ranking.js';

@Module({
  providers: [LeaderboardService, PostgresRanking, RedisRanking],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
