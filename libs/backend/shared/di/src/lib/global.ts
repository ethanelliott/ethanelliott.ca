import {
  Class,
  ClassProvider,
  createInjector,
  FactoryProvider,
  Injectable,
  MultiToken,
  ElementType,
  Provide,
  ValueProvider,
} from './di';

const globalInjector = createInjector('global');

export function inject<T>(injectable: Injectable<T>): T;
export function inject<T>(injectable: MultiToken<T>): T;
export function inject<T>(injectable: Injectable<T> | MultiToken<T>): T {
  return globalInjector.inject(injectable as any);
}

// Special overloads for multi tokens
export function provide<T>(
  multiToken: MultiToken<T>,
  useValue: ElementType<T>
): void;
export function provide<T>(
  provider: FactoryProvider<ElementType<T>> & { provide: MultiToken<T> }
): void;
export function provide<T>(
  provider: ValueProvider<ElementType<T>> & { provide: MultiToken<T> }
): void;
export function provide<T>(
  provider: ClassProvider<ElementType<T>> & { provide: MultiToken<T> }
): void;

// Regular overloads
export function provide<T>(provider: FactoryProvider<T>): void;
export function provide<T>(provider: ValueProvider<T>): void;
export function provide<T>(provider: ClassProvider<T>): void;
export function provide<T>(targetClass: Class<T>): void;
export function provide<T>(injectable: Injectable<T>, useValue: T): void;
export function provide<T>(providable: Provide<T>, value?: T) {
  if (value !== undefined) {
    globalInjector.provide(providable as any, value);
  } else {
    globalInjector.provide(providable as any);
  }
}
