import { createToken, inject, Class } from '@ee/di';
import { DataSource, ObjectLiteral } from 'typeorm';

export const ENTITIES = createToken<Class<any>>('entities', {
  multi: true,
});

export class Database {
  private readonly _entities = inject(ENTITIES);

  dataSource = new DataSource({
    type: 'better-sqlite3',
    database: 'finances.db',
    synchronize: true,
    logging: true,
    entities: this._entities,
  });

  constructor() {
    this.dataSource.initialize().catch((error) => {
      console.error('Error during Data Source initialization:', error);
    });
  }

  repositoryFor<T extends ObjectLiteral>(entity: new () => T) {
    return this.dataSource.getRepository<T>(entity);
  }
}
