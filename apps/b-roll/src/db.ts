import initSqlJs from 'sql.js';
import type { BindParams, Database } from 'sql.js';
import crypto from 'crypto';
import fs from 'fs';

export const DB_PATH = process.env.DB_PATH || './b-roll.sqlite';

export interface FileRecord {
  id: string;
  uid: string;
  filename: string;
  name: string;
  size: number;
  created_at: string;
}

export interface FileWithContent extends FileRecord {
  content: string;
}

let dbInstance: Database | null = null;

// sql.js is an in-memory WASM SQLite: load the file once at startup and
// write the whole database back to disk after every mutation.
export async function initDB(): Promise<void> {
  const SQL = await initSqlJs();
  dbInstance = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      filename TEXT NOT NULL,
      name TEXT,
      content TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_files_uid ON files(uid);
  `);
  const hasName = dbInstance.exec(
    "SELECT 1 FROM pragma_table_info('files') WHERE name = 'name'"
  );
  if (hasName.length === 0) {
    dbInstance.exec('ALTER TABLE files ADD COLUMN name TEXT');
  }
  persist();
}

function getDB(): Database {
  if (!dbInstance) {
    throw new Error('Database not initialized — call initDB() first');
  }
  return dbInstance;
}

function persist() {
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, Buffer.from(getDB().export()));
  fs.renameSync(tmpPath, DB_PATH);
}

export function closeDB() {
  if (dbInstance) {
    persist();
    dbInstance.close();
    dbInstance = null;
  }
}

function selectAll<T>(sql: string, params: BindParams = []): T[] {
  const stmt = getDB().prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return rows;
}

function newId(): string {
  return crypto.randomBytes(8).toString('base64url');
}

// Display name falls back to the original filename when unset.
const FILE_COLUMNS =
  'id, uid, filename, COALESCE(name, filename) AS name, size, created_at';

export function insertFile(
  uid: string,
  filename: string,
  name: string | undefined,
  content: string
): FileRecord {
  const db = getDB();
  const id = newId();
  const size = Buffer.byteLength(content, 'utf-8');
  db.run(
    'INSERT INTO files (id, uid, filename, name, content, size) VALUES (?, ?, ?, ?, ?, ?)',
    [id, uid, filename, name ?? null, content, size]
  );
  persist();
  return selectAll<FileRecord>(
    `SELECT ${FILE_COLUMNS} FROM files WHERE id = ?`,
    [id]
  )[0];
}

export function getFile(id: string): FileWithContent | undefined {
  return selectAll<FileWithContent>(
    `SELECT ${FILE_COLUMNS}, content FROM files WHERE id = ?`,
    [id]
  )[0];
}

export function listFiles(uid: string): FileRecord[] {
  return selectAll<FileRecord>(
    `SELECT ${FILE_COLUMNS} FROM files WHERE uid = ? ORDER BY created_at DESC`,
    [uid]
  );
}

export function renameFile(id: string, uid: string, name: string): boolean {
  const db = getDB();
  db.run('UPDATE files SET name = ? WHERE id = ? AND uid = ?', [
    name,
    id,
    uid,
  ]);
  if (db.getRowsModified() === 0) {
    return false;
  }
  persist();
  return true;
}

export function deleteFile(id: string, uid: string): boolean {
  const db = getDB();
  db.run('DELETE FROM files WHERE id = ? AND uid = ?', [id, uid]);
  if (db.getRowsModified() === 0) {
    return false;
  }
  persist();
  return true;
}
