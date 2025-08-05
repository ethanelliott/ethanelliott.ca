import { createToken, inject } from '@ee/di';

export type AppInitializer<T> = () => Promise<T> | T | void;

export const APP_INITIALIZER = createToken<AppInitializer<any>>(
  'APP_INITIALIZER',
  { multi: true }
);

export function provideApplicationInitializer<T>(
  initializer: AppInitializer<T>
) {
  return {
    provide: APP_INITIALIZER,
    useValue: initializer,
  };
}

export function injectApplicationInitializers() {
  return inject(APP_INITIALIZER);
}
