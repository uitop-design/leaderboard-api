import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module.js';
import { LeaderboardModule } from '../leaderboard/leaderboard.module.js';
import { LeaderboardGateway } from './leaderboard.gateway.js';
import { RealtimeService } from './realtime.service.js';

@Module({
  imports: [GamesModule, LeaderboardModule],
  providers: [LeaderboardGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
