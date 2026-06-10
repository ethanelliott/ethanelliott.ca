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

export async function addColumnIfNotExists(
  db: sqlite3.Database,
  table: string,
  column: string,
  type: string
) {
  try {
    await runPromise.call(
      db,
      `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`
    );
    console.log(`Added column ${column} to ${table}`);
  } catch (error: any) {
    if (error.message.includes('duplicate column name')) {
      // Column already exists, ignore
    } else {
      throw error;
    }
  }
}

const TABLE_DEFINITIONS: string[] = [
  // Table 1: Stores product metadata
  `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT,
      display_name TEXT,
      slug TEXT,
      description TEXT,
      designers_notes TEXT,
      fabric TEXT,
      brand TEXT,
      warmth TEXT,
      fit TEXT,
      category TEXT,
      rating REAL,
      review_count INTEGER,
      sustainability TEXT,
      neckline TEXT,
      sleeve TEXT,
      style TEXT,
      default_image TEXT,
      added_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      last_seen_at TEXT
  )`,
  // Table 2: Stores historical and current variant stock data
  `CREATE TABLE IF NOT EXISTS variants (
      id TEXT,
      product_id TEXT,
      color_id TEXT,
      color TEXT,
      length TEXT,
      price REAL,
      list_price REAL,
      available_sizes TEXT,
      all_sizes TEXT,
      swatch TEXT,
      ref_color TEXT,
      thumbnail_id TEXT,
      added_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      last_seen_at TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id),
      UNIQUE(id, product_id, color_id)
  )`,
  // Table 3: Stores image metadata and binary data
  `CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      added_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      product_id TEXT,
      variant_id TEXT,
      image BLOB,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (variant_id) REFERENCES variants(id),
      UNIQUE(product_id, variant_id, id)
  )`,
  // Table 4: Price History
  `CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id TEXT,
      price REAL,
      list_price REAL,
      timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (variant_id) REFERENCES variants(id)
  )`,
  // Table 5: Restocks
  `CREATE TABLE IF NOT EXISTS restocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id TEXT,
      timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (variant_id) REFERENCES variants(id)
  )`,
  // Table 6: Store Availability
  `CREATE TABLE IF NOT EXISTS store_availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT,
      variant_id TEXT,
      color_id TEXT,
      available_sizes TEXT,
      timestamp TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (variant_id) REFERENCES variants(id),
      UNIQUE(store_id, variant_id, color_id, timestamp)
  )`,
  // Table 7: Stores (store metadata)
  `CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT,
      city TEXT,
      province TEXT,
      country TEXT
  )`,
  // Table 8: AI Summaries cache
  `CREATE TABLE IF NOT EXISTS ai_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT,
      summary TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (product_id) REFERENCES products(id),
      UNIQUE(product_id)
  )`,
  // Table 9: Scan runs. A scan only counts as the source of truth for
  // "active vs discontinued" once completed_at is set, so a scrape that
  // dies halfway can never flip the whole catalog to discontinued.
  `CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scrape_time TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
  )`,
];

const COLUMN_MIGRATIONS: Array<[table: string, column: string, type: string]> =
  [
    ['products', 'fabric', 'TEXT'],
    ['products', 'brand', 'TEXT'],
    ['products', 'warmth', 'TEXT'],
    ['products', 'fit', 'TEXT'],
    ['products', 'display_name', 'TEXT'],
    ['products', 'description', 'TEXT'],
    ['products', 'designers_notes', 'TEXT'],
    ['products', 'category', 'TEXT'],
    ['products', 'rating', 'REAL'],
    ['products', 'review_count', 'INTEGER'],
    ['products', 'sustainability', 'TEXT'],
    ['products', 'neckline', 'TEXT'],
    ['products', 'sleeve', 'TEXT'],
    ['products', 'style', 'TEXT'],
    ['products', 'default_image', 'TEXT'],
    ['variants', 'price', 'REAL'],
    ['variants', 'list_price', 'REAL'],
    ['variants', 'available_sizes', 'TEXT'],
    ['variants', 'all_sizes', 'TEXT'],
    ['variants', 'swatch', 'TEXT'],
    ['variants', 'ref_color', 'TEXT'],
    ['variants', 'thumbnail_id', 'TEXT'],
  ];

const INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_variants_last_seen_at ON variants(last_seen_at)`,
  `CREATE INDEX IF NOT EXISTS idx_variants_color ON variants(color)`,
  `CREATE INDEX IF NOT EXISTS idx_variants_color_id ON variants(color_id)`,
  `CREATE INDEX IF NOT EXISTS idx_images_variant_id ON images(variant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_images_product_id ON images(product_id)`,
  `CREATE INDEX IF NOT EXISTS idx_prices_variant_id ON prices(variant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_store_availability_variant_id ON store_availability(variant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_store_availability_store_id ON store_availability(store_id)`,
  `CREATE INDEX IF NOT EXISTS idx_restocks_variant_id ON restocks(variant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_summaries_product_id ON ai_summaries(product_id)`,
];

// Columns that historically mixed SQLite's "YYYY-MM-DD HH:MM:SS.SSS" default
// format with the scraper's ISO-8601 "YYYY-MM-DDTHH:MM:SS.SSSZ". Lexicographic
// comparisons (MAX, ORDER BY) are only chronologically correct if every value
// uses one format, so old rows are normalized to ISO-8601 UTC.
const TIMESTAMP_COLUMNS: Array<[table: string, column: string]> = [
  ['products', 'added_at'],
  ['products', 'last_seen_at'],
  ['variants', 'added_at'],
  ['variants', 'last_seen_at'],
  ['images', 'added_at'],
  ['prices', 'timestamp'],
  ['restocks', 'timestamp'],
  ['store_availability', 'timestamp'],
  ['ai_summaries', 'created_at'],
];

export async function setupDatabase(db: sqlite3.Database): Promise<void> {
  console.log(`Setting up database at ${DB_PATH}...`);

  for (const sql of TABLE_DEFINITIONS) {
    await runPromise.call(db, sql);
  }

  for (const [table, column, type] of COLUMN_MIGRATIONS) {
    await addColumnIfNotExists(db, table, column, type);
  }

  for (const sql of INDEXES) {
    await runPromise.call(db, sql);
  }

  for (const [table, column] of TIMESTAMP_COLUMNS) {
    await runPromise.call(
      db,
      `UPDATE ${table} SET ${column} = REPLACE(${column}, ' ', 'T') || 'Z' WHERE ${column} LIKE '% %'`
    );
  }

  // Backfill variants.thumbnail_id for rows created before the column existed.
  // Falls back to an image of the same color on a sibling variant, since an
  // image id can only be linked to one variant (images.id is the primary key).
  await runPromise.call(
    db,
    `UPDATE variants SET thumbnail_id = COALESCE(
       (SELECT id FROM images WHERE images.variant_id = variants.id LIMIT 1),
       (SELECT i.id FROM images i
        JOIN variants v2 ON i.variant_id = v2.id
        WHERE v2.product_id = variants.product_id AND v2.color = variants.color
        LIMIT 1)
     )
     WHERE thumbnail_id IS NULL`
  );

  // Enable WAL mode for better concurrent read performance
  await runPromise.call(db, `PRAGMA journal_mode=WAL`);
  console.log('Database tables initialized with indexes and WAL mode enabled.');
}
