import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { setupSwagger } from './docs/swagger.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.enableShutdownHooks();
  setupSwagger(app);
  const port = app.get(AppConfigService).get('PORT');
  await app.listen(port);
  Logger.log(`Listening on port ${port}, docs at /docs`, 'Bootstrap');
}

void bootstrap();
