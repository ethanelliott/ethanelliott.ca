import { autoFactory, inject, Injectable, provide } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { RootRouter } from './routes/root';

@Injectable()
export class DependentService {
  doThing() {
    return 'hello';
  }
}

@Injectable()
export class MyService {
  constructor(public dS: DependentService) {}

  anotherThing() {
    return this.dS.doThing() + ' world';
  }
}

export async function Application(fastify: FastifyInstance) {
  console.log(autoFactory(MyService));
  const s = inject(MyService);

  console.log(s.anotherThing());

  fastify.register(RootRouter);
}
