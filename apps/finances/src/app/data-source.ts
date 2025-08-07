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
    extra: {
      foreignKeys: true,
    },
  });

  constructor() {
    this.dataSource
      .initialize()
      .then(() => {
        console.log(
          `📊 Registered entities: ${this._entities
            .map((e) => e.name)
            .join(', ')}`
        );
      })
      .catch((error) => {
        process.exit(1);
      });
  }

  repositoryFor<T extends ObjectLiteral>(entity: new () => T) {
    return this.dataSource.getRepository<T>(entity);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
