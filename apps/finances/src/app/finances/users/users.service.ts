import { inject } from '@ee/di';
import { Database } from '../../data-source';
import { User } from './user';

export class UsersService {
  private readonly _repository = inject(Database).repositoryFor(User);
}
