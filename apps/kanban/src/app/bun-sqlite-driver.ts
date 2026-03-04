/// <reference types="bun-types" />
/**
 * Thin adapter that makes Bun's built-in `bun:sqlite` Database look like
 * `better-sqlite3` so TypeORM's BetterSqlite3Driver can use it without
 * any native binaries.
 *
 * Passed via the `driver` option in the TypeORM DataSource — no module
 * aliasing or bundler hacks needed.
 *
 * TypeORM expects:
 *  - new Driver(filename, options)         → database handle
 *  - db.prepare(sql)                        → statement with .reader, .run(), .all(), .get()
 *  - db.pragma(str)                         → set/read a PRAGMA, returns array
 *  - db.transaction(fn)                     → wraps fn in a SQLite transaction
 *  - db.close()                             → close the database
 */
import { Database as BunDatabase, type Statement } from 'bun:sqlite';

// Determine if a SQL string is a read (SELECT / PRAGMA read) or a write.
// TypeORM checks `stmt.reader` to decide whether to call .all() or .run().
// PRAGMA foo        → reader (returns rows)
// PRAGMA foo = val  → writer (sets value, returns nothing useful)
function isReader(sql: string): boolean {
  const s = sql.trimStart().toUpperCase();
  if (s.startsWith('SELECT') || s.startsWith('WITH')) return true;
  if (s.startsWith('PRAGMA')) return !s.includes('=');
  return false;
}

class BunSQLiteStatement {
  readonly reader: boolean;

  constructor(private readonly stmt: Statement, sql: string) {
    this.reader = isReader(sql);
  }

  run(...args: unknown[]): {
    changes: number;
    lastInsertRowid: number | bigint;
  } {
    const r = this.stmt.run(...(args as Parameters<typeof this.stmt.run>));
    return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
  }

  get(...args: unknown[]): unknown {
    // better-sqlite3 returns undefined (not null) when no row found
    return (
      this.stmt.get(...(args as Parameters<typeof this.stmt.get>)) ?? undefined
    );
  }

  all(...args: unknown[]): unknown[] {
    return this.stmt.all(...(args as Parameters<typeof this.stmt.all>));
  }
}

export class BunSQLiteDriver {
  private readonly _db: BunDatabase;

  constructor(filename: string, _options?: Record<string, unknown>) {
    this._db = new BunDatabase(filename);
  }

  prepare(sql: string): BunSQLiteStatement {
    return new BunSQLiteStatement(this._db.prepare(sql), sql);
  }

  /**
   * bun:sqlite has no .pragma() — execute as a plain query instead.
   * Returns an array for parity with better-sqlite3's return type.
   */
  pragma(str: string): unknown[] {
    return this._db.query(`PRAGMA ${str}`).all();
  }

  transaction<T extends (...args: unknown[]) => unknown>(fn: T): T {
    return this._db.transaction(fn) as unknown as T;
  }

  exec(sql: string): void {
    this._db.exec(sql);
  }

  close(): void {
    this._db.close();
  }
}
