import { eq, lte, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '#backend/db/index.js';
import { rateLimits } from '#backend/db/schema.js';
import { registerSweepCleanup } from '../shares/sweep';
import type { AppEnv } from '../auth/middleware';

export type Limit = { key: string; max: number; windowMs: number };

export const clientIp = (c: Context<AppEnv>) => c.env?.clientAddress || 'unknown';

// Fixed window: the first failure opens it, and the count resets only once it has fully elapsed.
export const retryAfterSeconds = (limit: Limit) => {
    const row = getDb().select().from(rateLimits).where(eq(rateLimits.key, limit.key)).get();
    if (!row || row.count < limit.max) return 0;
    const left = row.expiresAt.getTime() - Date.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
};

export const recordFailure = (limit: Limit) => {
    const now = Date.now();
    getDb()
        .insert(rateLimits)
        .values({ key: limit.key, count: 1, expiresAt: new Date(now + limit.windowMs) })
        .onConflictDoUpdate({
            target: rateLimits.key,
            set: {
                count: sql`CASE WHEN ${rateLimits.expiresAt} <= ${now} THEN 1 ELSE ${rateLimits.count} + 1 END`,
                expiresAt: sql`CASE WHEN ${rateLimits.expiresAt} <= ${now} THEN ${now + limit.windowMs} ELSE ${rateLimits.expiresAt} END`
            }
        })
        .run();
};

export const clearLimit = (limit: Limit) => {
    getDb().delete(rateLimits).where(eq(rateLimits.key, limit.key)).run();
};

export const tooManyAttempts = (c: Context, retryAfter: number) => {
    c.header('retry-after', String(retryAfter));
    return c.json({ error: 'Too many attempts', retryAfter }, 429);
};

registerSweepCleanup(() => {
    getDb().delete(rateLimits).where(lte(rateLimits.expiresAt, new Date())).run();
});
