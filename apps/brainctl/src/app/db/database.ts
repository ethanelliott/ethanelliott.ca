import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;

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

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
