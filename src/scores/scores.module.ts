import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module.js';
import { LeaderboardModule } from '../leaderboard/leaderboard.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { ScoresController } from './scores.controller.js';
import { ScoresService } from './scores.service.js';

@Module({
  imports: [GamesModule, LeaderboardModule, RealtimeModule],
  controllers: [ScoresController],
  providers: [ScoresService],
})
export class ScoresModule {}
