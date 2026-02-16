import 'dotenv/config';
import 'reflect-metadata';
import { Application } from './app/app';
import { starter } from '@ee/starter';
import { appConfig } from './app/app.config';
import { logger } from './app/logger';

starter(Application, appConfig).catch((error) => {
  logger.fatal({ err: error }, 'Application failed to start');
  process.exit(1);
});
