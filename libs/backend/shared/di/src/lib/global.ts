import { createInjector, Injectable, Providable } from './di';

const globalInjector = createInjector('global');

export function inject<T>(injectable: Injectable<T>): T {
  return globalInjector.inject(injectable);
}

export function provide<T extends Injectable<R>, R>(providable: Providable<T>) {
  globalInjector.provide(providable);
}
