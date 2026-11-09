import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/dto/pagination.dto.js';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import type { Game } from '../generated/prisma/client.js';
import {
  CreateGameDto,
  GameDetailsDto,
  GameDto,
  GameListDto,
  GameSlugParamDto,
} from './dto/game.dto.js';
import { GamesService, type GameDetails, type GameListItem, type Page } from './games.service.js';

@ApiTags('games')
@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a game' })
  @ApiCreatedResponse({ type: GameDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT)
  create(@Body() dto: CreateGameDto): Promise<Game> {
    return this.games.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List games, newest first' })
  @ApiOkResponse({ type: GameListDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  list(@Query() query: PaginationQueryDto): Promise<Page<GameListItem>> {
    return this.games.list(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a game with its statistics' })
  @ApiOkResponse({ type: GameDetailsDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  details(@Param() { slug }: GameSlugParamDto): Promise<GameDetails> {
    return this.games.details(slug);
  }

  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a game with all its scores' })
  @ApiNoContentResponse()
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  remove(@Param() { slug }: GameSlugParamDto): Promise<void> {
    return this.games.remove(slug);
  }
}
