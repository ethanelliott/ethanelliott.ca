import {
  Class,
  ClassProvider,
  createInjector,
  FactoryProvider,
  Injectable,
  Provide,
  ValueProvider,
} from './di';

const globalInjector = createInjector('global');

export function inject<T>(injectable: Injectable<T>): T {
  return globalInjector.inject(injectable);
}

export function provide<T>(provider: FactoryProvider<T>): void;
export function provide<T>(provider: ValueProvider<T>): void;
export function provide<T>(provider: ClassProvider<T>): void;
export function provide<T>(targetClass: Class<T>): void;
export function provide<T>(injectable: Injectable<T>, useValue: T): void;
export function provide<T>(providable: Provide<T>, value?: T) {
  globalInjector.provide(providable as any);
}

export function autoFactory<T>(Class: new (...args: any[]) => T): () => T {
  const deps = Reflect.getMetadata('design:paramtypes', Class) || [];
  console.log(deps);

  return () => {
    const resolved = deps.map((dep: Injectable<T>) => inject(dep));
    return new Class(...resolved);
  };
}
