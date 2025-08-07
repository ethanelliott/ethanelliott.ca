import { inject } from '@ee/di';
import { FastifyInstance } from 'fastify';
import { UsersService } from './users.service';

export async function UsersRouter(fastify: FastifyInstance) {
  const _usersService = inject(UsersService);
}
