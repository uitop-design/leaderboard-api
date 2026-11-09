import { Module } from '@nestjs/common';
import { LeaderboardModule } from '../leaderboard/leaderboard.module.js';
import { GamesController } from './games.controller.js';
import { GamesService } from './games.service.js';

@Module({
  imports: [LeaderboardModule],
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
