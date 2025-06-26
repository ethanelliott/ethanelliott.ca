import { AppConfig, provideApplicationInitializer } from '@ee/starter';

export const appConfig: AppConfig = {
  providers: [
    provideApplicationInitializer(() => {
      console.log('hello');
    }),
    provideApplicationInitializer(() => {
      console.log('world');
    }),
  ],
};
