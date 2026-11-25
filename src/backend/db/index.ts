import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { dbPath } from '../lib/paths.js';
import * as schema from './schema';

let db: BetterSQLite3Database<typeof schema> | undefined;

export const getDb = () => {
    if (db) return db;

    const sqlite = new Database(dbPath());
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    db = drizzle(sqlite, { schema });

    // cwd, not import.meta: the bundled server has no src/ tree next to it
    const migrationsFolder = resolve('drizzle');
    if (existsSync(join(migrationsFolder, 'meta', '_journal.json'))) {
        migrate(db, { migrationsFolder });
    }

    return db;
};
