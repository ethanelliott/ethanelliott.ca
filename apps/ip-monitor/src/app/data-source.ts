import { createToken, inject, Class } from '@ee/di';
import { DataSource, ObjectLiteral } from 'typeorm';
import 'better-sqlite3';

export const ENTITIES = createToken<Class<any>>('entities', {
  multi: true,
});

export class Database {
  private readonly _entities = inject(ENTITIES);

  dataSource = new DataSource({
    type: 'better-sqlite3',
    database:
      process.env.NODE_ENV === 'production'
        ? '/app/data/ip-monitor.db'
        : 'ip-monitor.db',
    synchronize: true,
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
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
      });
  }

  repositoryFor<T extends ObjectLiteral>(entity: Class<T>) {
    return this.dataSource.getRepository(entity);
  }
}
