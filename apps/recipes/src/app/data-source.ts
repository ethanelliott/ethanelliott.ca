import { createToken, inject, Class } from '@ee/di';
import { DataSource, ObjectLiteral } from 'typeorm';
// Ensure native dependencies are included in the build
import 'better-sqlite3';
import { logger } from './logger';

export const ENTITIES = createToken<Class<any>>('entities', {
  multi: true,
});

export class Database {
  private readonly _entities = inject(ENTITIES);

  dataSource = new DataSource({
    type: 'better-sqlite3',
    database:
      process.env.NODE_ENV === 'production'
        ? '/app/data/recipes.db'
        : 'recipes.db',
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
        logger.info(
          { entities: this._entities.map((e) => e.name) },
          'Database initialized'
        );
      })
      .catch((error) => {
        logger.fatal({ err: error }, 'Database initialization failed');
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
