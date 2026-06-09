import { Application } from './app/app.js';
import { starter } from '@ee/starter';
import { appConfig } from './app/app.config.js';
import { closeDb } from './app/db/database.js';
import { initDefaultSchedule } from './app/services/scheduler.service.js';

process.on('SIGTERM', () => { closeDb(); process.exit(0); });
process.on('SIGINT', () => { closeDb(); process.exit(0); });

initDefaultSchedule();
starter(Application, appConfig).catch((error) => console.error(error));
