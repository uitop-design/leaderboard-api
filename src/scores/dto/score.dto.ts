import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { gameSlugSchema } from '../../games/dto/game.schemas.js';

export const MAX_SCORE = 1_000_000_000;

const playerNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{2,32}$/, 'must be 2-32 characters: letters, digits, "_" or "-"')
  .describe('Player name, case-insensitive for ranking');

const scoreValueSchema = z.int().min(0).max(MAX_SCORE);

const scoreSchema = z.object({
  id: z.uuid(),
  playerName: playerNameSchema,
  value: scoreValueSchema,
  createdAt: z.iso.datetime(),
});

const leaderboardEntrySchema = z.object({
  rank: z.int().min(1),
  playerName: playerNameSchema,
  score: scoreValueSchema,
});

export class SubmitScoreDto extends createZodDto(
  z.strictObject({ playerName: playerNameSchema, value: scoreValueSchema }),
) {}

export class LeaderboardQueryDto extends createZodDto(
  z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) }),
) {}

export class PlayerParamDto extends createZodDto(
  z.object({ slug: gameSlugSchema, playerName: playerNameSchema }),
) {}

export class SubmitScoreResultDto extends createZodDto(
  z.object({
    score: scoreSchema,
    best: scoreValueSchema,
    rank: z.int().min(1),
    isPersonalBest: z.boolean(),
  }),
) {}

export class LeaderboardEntryDto extends createZodDto(leaderboardEntrySchema) {}

export class PlayerStandingDto extends createZodDto(
  z.object({
    playerName: playerNameSchema,
    best: scoreValueSchema,
    rank: z.int().min(1),
    scoresCount: z.int().min(1),
  }),
) {}
