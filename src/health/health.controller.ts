import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../common/swagger/api-error-responses.decorator.js';
import { HealthDto } from './health.dto.js';
import { HealthService, type HealthReport } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check Postgres and Redis availability' })
  @ApiOkResponse({ type: HealthDto })
  @ApiErrorResponses(HttpStatus.SERVICE_UNAVAILABLE)
  check(): Promise<HealthReport> {
    return this.health.check();
  }
}
