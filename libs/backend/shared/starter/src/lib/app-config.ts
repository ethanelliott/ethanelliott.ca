import { Injectable, Providable } from '@ee/di';

export type AppConfig = {
  providers: Array<Providable<any>>;
};
