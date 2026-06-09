import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { EMBEDDING_DIMENSIONS } from '../services/embeddings.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;
let _vecLoaded = false;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = process.env['BRAIN_DB'] ?? join(process.env['HOME'] ?? '/tmp', 'brainctl', 'brain.db');
  mkdirSync(dirname(dbPath), { recursive: true });

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 10000');
  _db.pragma('foreign_keys = ON');

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  _db.exec(schema);

  runMigrations(_db);

  _vecLoaded = tryLoadVec(_db);
  if (_vecLoaded) initVecTables(_db);

  return _db;
}

export function isVecLoaded(): boolean {
  return _vecLoaded;
}

// Safe ALTER TABLE for columns added after initial schema deployment.
// SQLite has no "ADD COLUMN IF NOT EXISTS" so we catch the duplicate-column error.
// This means migrations are idempotent: safe to re-run on every startup.
function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string): void {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch {
    // Column already exists — ignore
  }
}

function runMigrations(db: Database.Database): void {
  addColumnIfMissing(db, 'memories', 'recalled_count', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'memories', 'temporal_class', "TEXT NOT NULL DEFAULT 'medium'");
  addColumnIfMissing(db, 'memories', 'last_accessed_at', 'TEXT');
  addColumnIfMissing(db, 'memories', 'compressed_into', 'INTEGER');
  addColumnIfMissing(db, 'memories', 'quarantined_at', 'TEXT');
}

function tryLoadVec(db: Database.Database): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(db);
    return true;
  } catch {
    console.warn('[db] sqlite-vec not available — vector search disabled');
    return false;
  }
}

// Vec tables must be created with the embedding dimension baked in.
// If LITELLM_EMBEDDING_DIMENSIONS changes, the old vec tables are incompatible
// and the DB must be re-created or the vec tables dropped and recreated manually.
function initVecTables(db: Database.Database): void {
  const dim = EMBEDDING_DIMENSIONS;
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories
      USING vec0(rowid INTEGER PRIMARY KEY, embedding FLOAT[${dim}]);
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_entities
      USING vec0(rowid INTEGER PRIMARY KEY, embedding FLOAT[${dim}]);
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_events
      USING vec0(rowid INTEGER PRIMARY KEY, embedding FLOAT[${dim}]);
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_context
      USING vec0(rowid INTEGER PRIMARY KEY, embedding FLOAT[${dim}]);
  `);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    _vecLoaded = false;
  }
}
