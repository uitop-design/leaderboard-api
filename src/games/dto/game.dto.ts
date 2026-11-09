import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  gameDetailsSchema,
  gameListSchema,
  gameNameSchema,
  gameSchema,
  gameSlugSchema,
} from './game.schemas.js';

export class CreateGameDto extends createZodDto(
  z.strictObject({ slug: gameSlugSchema, name: gameNameSchema }),
) {}

export class GameSlugParamDto extends createZodDto(z.object({ slug: gameSlugSchema })) {}

export class GameDto extends createZodDto(gameSchema) {}

export class GameListDto extends createZodDto(gameListSchema) {}

export class GameDetailsDto extends createZodDto(gameDetailsSchema) {}
