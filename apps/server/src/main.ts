import { Application } from './app/app';
import { starter } from '@ee/starter';
import { appConfig } from './app/app.config';

starter(Application, appConfig).catch((error) => console.error(error));
