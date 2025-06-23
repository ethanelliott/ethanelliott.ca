import { Provide } from '@ee/di';

export type AppConfig = {
  providers: Array<Provide<any>>;
};
