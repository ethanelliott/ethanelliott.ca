import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { createProgressBar } from './utils';

export const DB_PATH = process.env.DB_PATH || './aritzia_stock.sqlite';

let dbInstance: sqlite3.Database | null = null;

export function getDB(): sqlite3.Database {
  if (!dbInstance) {
    dbInstance = new sqlite3.Database(DB_PATH);
  }
  return dbInstance;
}

export function closeDB() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

// Define explicit types for the promisified database methods
export type PromisifiedRun = (sql: string, params?: any[]) => Promise<void>;
export type PromisifiedAll = (sql: string, params?: any[]) => Promise<any[]>;
export type PromisifiedGet = (sql: string, params?: any[]) => Promise<any>;
export type PromisifiedStmtRun = (params?: any[]) => Promise<void>;

// Promisify sqlite methods with explicit type assertions
export const runPromise = promisify(
  sqlite3.Database.prototype.run
) as PromisifiedRun;
export const allPromise = promisify(
  sqlite3.Database.prototype.all
) as PromisifiedAll;
export const getPromise = promisify(
  sqlite3.Database.prototype.get
) as PromisifiedGet;

export async function getCountPromise(
  db: sqlite3.Database,
  table: string
): Promise<number> {
  return getPromise
    .call(db, `SELECT COUNT(*) as count FROM ${table}`)
    .then((row: any) => row.count);
}

/**
 * Executes an array of parameter sets against a single prepared statement within a transaction.
 */
export async function prepareRunAll(
  db: sqlite3.Database,
  sql: string,
  records: any[][],
  label: string
): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const advance = createProgressBar(records.length, label);
  const stmt = db.prepare(sql);

  // Promisify stmt.run for sequential execution inside the loop, asserting the type
  const stmtRunPromise = promisify(stmt.run).bind(stmt) as PromisifiedStmtRun;

  await runPromise.call(db, 'BEGIN TRANSACTION');
  try {
    for (const record of records) {
      await stmtRunPromise(record);
      advance();
    }
    await runPromise.call(db, 'COMMIT');
  } catch (error) {
    await runPromise.call(db, 'ROLLBACK');
    console.error(`\nTransaction failed for ${label}. Rolling back.`);
    throw error;
  } finally {
    stmt.finalize();
  }
}

export function setupDatabase(db: sqlite3.Database): Promise<void> {
  console.log(`Setting up database at ${DB_PATH}...`);
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Table 1: Stores product metadata
      db.run(`
          CREATE TABLE IF NOT EXISTS products (
              id TEXT PRIMARY KEY,
              name TEXT,
              slug TEXT,
              added_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
              last_seen_at TEXT
          );
      `);

      // Table 2: Stores historical and current variant stock data
      db.run(
        `
          CREATE TABLE IF NOT EXISTS variants (
              id TEXT,
              product_id TEXT,
              color_id TEXT,
              color TEXT,
              length TEXT,
              added_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
              last_seen_at TEXT,
              FOREIGN KEY (product_id) REFERENCES products(id),
              UNIQUE(id, product_id, color_id)
          );
      `
      );

      // Table 3: Stores image metadata (IDs, not the binary data)
      db.run(
        `
          CREATE TABLE IF NOT EXISTS images (
              id TEXT PRIMARY KEY,
              added_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
              product_id TEXT,
              variant_id TEXT,
              image BLOB,
              FOREIGN KEY (product_id) REFERENCES products(id),
              FOREIGN KEY (variant_id) REFERENCES variants(id),
              UNIQUE(product_id, variant_id, id)
          );
        `,
        (err) => {
          if (err) return reject(err);
          console.log(
            'Database tables initialized (products, variants, images).'
          );
          resolve();
        }
      );
    });
  });
}
