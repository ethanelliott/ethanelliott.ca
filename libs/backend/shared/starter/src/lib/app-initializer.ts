import { createToken, inject } from '@ee/di';

export type AppInitializer<T> = () => Promise<T> | T | void;

export const APP_INITIALIZER =
  createToken<Array<AppInitializer<any>>>('APP_INITIALIZER');

export function provideApplicationInitializer<T>(
  initializer: AppInitializer<T>
) {
  return {
    provide: APP_INITIALIZER,
    useValue: initializer,
    multi: true,
  };
}

export function injectApplicationInitializers() {
  return inject(APP_INITIALIZER);
}
