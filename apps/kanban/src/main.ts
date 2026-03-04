import 'dotenv/config';
import 'reflect-metadata';
import { Application } from './app/app';
import { starter } from '@ee/starter';
import { appConfig } from './app/app.config';

starter(Application, appConfig).catch((error) => {
  console.error('Application failed to start', error);
  process.exit(1);
});
