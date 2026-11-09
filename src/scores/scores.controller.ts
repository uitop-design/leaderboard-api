import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import { GameSlugParamDto } from '../games/dto/game.dto.js';
import type { LeaderboardEntry } from '../leaderboard/leaderboard.types.js';
import {
  LeaderboardEntryDto,
  LeaderboardQueryDto,
  PlayerParamDto,
  PlayerStandingDto,
  SubmitScoreDto,
  SubmitScoreResultDto,
} from './dto/score.dto.js';
import { ScoresService, type PlayerStanding, type SubmitScoreResult } from './scores.service.js';

@ApiTags('scores')
@Controller('games/:slug')
export class ScoresController {
  constructor(private readonly scores: ScoresService) {}

  @Post('scores')
  @ApiOperation({ summary: 'Submit a score' })
  @ApiCreatedResponse({ type: SubmitScoreResultDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  submit(
    @Param() { slug }: GameSlugParamDto,
    @Body() dto: SubmitScoreDto,
  ): Promise<SubmitScoreResult> {
    return this.scores.submit(slug, dto);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get the top players of a game' })
  @ApiOkResponse({ type: LeaderboardEntryDto, isArray: true })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  leaderboard(
    @Param() { slug }: GameSlugParamDto,
    @Query() { limit }: LeaderboardQueryDto,
  ): Promise<LeaderboardEntry[]> {
    return this.scores.leaderboardOf(slug, limit);
  }

  @Get('players/:playerName')
  @ApiOperation({ summary: 'Get the best score and rank of a player' })
  @ApiOkResponse({ type: PlayerStandingDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  standing(@Param() { slug, playerName }: PlayerParamDto): Promise<PlayerStanding> {
    return this.scores.standing(slug, playerName);
  }
}
