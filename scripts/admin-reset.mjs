// Standalone so it runs in the production image, where the TS sources and dev deps are absent.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { createId } from '@paralleldrive/cuid2';

const dbPath = join(resolve(process.env.DATA_DIR ?? './.onecrab'), 'data.db');
if (!existsSync(dbPath)) {
    console.error(`No database at ${dbPath}. Start onecrab once first.`);
    process.exit(1);
}

const db = new Database(dbPath);
const admin = db.prepare("SELECT id FROM users WHERE role = 'superadmin'").get();
if (!admin) {
    console.error('No superadmin exists yet. Use the setup link printed in the server log.');
    process.exit(1);
}

const a = createId();
const b = createId();
db.prepare(
    `INSERT INTO setup_links (purpose, a, b, created_at) VALUES ('reset', ?, ?, ?)
     ON CONFLICT(purpose) DO UPDATE SET a = excluded.a, b = excluded.b, created_at = excluded.created_at`
).run(a, b, Date.now());

console.log(`Reset the superadmin password at:\n  ${process.env.ORIGIN ?? ''}/setup/${a}/${b}`);
