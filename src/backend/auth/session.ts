import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '#backend/db/index.js';
import { sessions, users, type User } from '#backend/db/schema.js';

export const SESSION_COOKIE = 'onecrab_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_WHEN_LEFT_MS = 15 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const createSession = (userId: string) => {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    getDb().insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt }).run();
    return { token, expiresAt };
};

export type ValidSession = { user: User; expiresAt: Date; refreshed: boolean };

export const validateSession = (token: string | undefined): ValidSession | null => {
    if (!token) return null;
    const db = getDb();
    const tokenHash = hashToken(token);
    const row = db
        .select({ user: users, expiresAt: sessions.expiresAt })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(eq(sessions.tokenHash, tokenHash))
        .get();
    if (!row) return null;

    const now = Date.now();
    if (row.expiresAt.getTime() <= now) {
        db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run();
        return null;
    }

    if (row.expiresAt.getTime() - now < REFRESH_WHEN_LEFT_MS) {
        const expiresAt = new Date(now + SESSION_TTL_MS);
        db.update(sessions).set({ expiresAt }).where(eq(sessions.tokenHash, tokenHash)).run();
        return { user: row.user, expiresAt, refreshed: true };
    }

    return { user: row.user, expiresAt: row.expiresAt, refreshed: false };
};

export const deleteSession = (token: string) => {
    getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token))).run();
};
