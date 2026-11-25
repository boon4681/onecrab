import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, isNotNull, lte, or, sql } from 'drizzle-orm';
import { getDb } from '#backend/db/index.js';
import { shares } from '#backend/db/schema.js';
import { filesDir } from './service';

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const STALE_TMP_MS = 60 * 60 * 1000;

const extraCleanups: Array<() => void> = [];

// Hook for other modules (e.g. rate-limit counters) to be pruned on each sweep.
export const registerSweepCleanup = (fn: () => void) => {
    extraCleanups.push(fn);
};

export const sweep = () => {
    const db = getDb();
    const dead = db
        .select({ id: shares.id })
        .from(shares)
        .where(
            or(
                lte(shares.expiresAt, new Date()),
                and(isNotNull(shares.maxDownloads), sql`${shares.downloads} >= ${shares.maxDownloads}`)
            )
        )
        .all();
    const dir = filesDir();
    for (const { id } of dead) {
        db.delete(shares).where(eq(shares.id, id)).run();
        rmSync(join(dir, id), { force: true });
    }

    const known = new Set(
        db
            .select({ id: shares.id })
            .from(shares)
            .all()
            .map((r) => r.id)
    );
    const now = Date.now();
    for (const name of readdirSync(dir)) {
        if (known.has(name)) continue;
        const path = join(dir, name);
        // A fresh .tmp may be an upload still being written.
        if (name.endsWith('.tmp') && now - statSync(path).mtimeMs < STALE_TMP_MS) continue;
        rmSync(path, { force: true });
    }

    for (const fn of extraCleanups) fn();
};

let timer: ReturnType<typeof setInterval> | undefined;

export const startSweeper = () => {
    if (timer) return;
    const run = () => {
        try {
            sweep();
        } catch (err) {
            console.error('[onecrab] sweep failed', err);
        }
    };
    run();
    timer = setInterval(run, SWEEP_INTERVAL_MS);
    timer.unref();
};
