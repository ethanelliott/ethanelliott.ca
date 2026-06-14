import { createToken, inject, Class } from '@ee/di';
import { DataSource, ObjectLiteral } from 'typeorm';
import 'pg';

export const ENTITIES = createToken<Class<any>>('entities', {
  multi: true,
});

export class Database {
  private readonly _entities = inject(ENTITIES);

  dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'aranet',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'aranet',
    synchronize: true,
    entities: this._entities,
  });

  /** Resolves once the DataSource is initialized and entity metadata is built. */
  readonly ready: Promise<unknown>;

  constructor() {
    this.ready = this.dataSource.initialize();
    this.ready
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
