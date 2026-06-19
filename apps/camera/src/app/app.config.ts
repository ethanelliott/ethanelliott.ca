import { AppConfig, provideApplicationInitializer } from '@ee/starter';
import { inject } from '@ee/di';
import { Database } from './data-source';

// Entities must be imported so they are registered with the DI ENTITIES
// token before the Database singleton builds the DataSource below.
import './detection';
import './notification';
import './analysis';
import './recording';

export const appConfig: AppConfig = {
  providers: [
    // Block application startup until the database connection is open and
    // entity metadata is built. This runs (and is awaited) before the app
    // plugin is registered and its `onReady` hooks fire, so every service is
    // guaranteed a ready DataSource and never races initialization.
    provideApplicationInitializer(() => inject(Database).whenReady()),
  ],
};
