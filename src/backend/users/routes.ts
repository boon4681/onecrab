import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '#backend/db/index.js';
import { accounts, invites, sessions, shares, users } from '#backend/db/schema.js';
import { requireSuperadmin, type AppEnv } from '../auth/middleware';
import { removeBlob } from '../shares/service';

const listUsers = () => {
    const db = getDb();
    const providersByUser = new Map<string, string[]>();
    for (const a of db.select().from(accounts).orderBy(asc(accounts.createdAt)).all()) {
        const list = providersByUser.get(a.userId) ?? [];
        if (!list.includes(a.provider)) list.push(a.provider);
        providersByUser.set(a.userId, list);
    }

    const usage = new Map<string, { count: number; bytes: number }>();
    for (const s of db.select({ ownerId: shares.ownerId, size: shares.size, expiresAt: shares.expiresAt, downloads: shares.downloads, maxDownloads: shares.maxDownloads }).from(shares).all()) {
        const total = usage.get(s.ownerId) ?? { count: 0, bytes: 0 };
        total.bytes += s.size;
        if (s.expiresAt.getTime() > Date.now() && (s.maxDownloads == null || s.downloads < s.maxDownloads)) total.count++;
        usage.set(s.ownerId, total);
    }

    return db
        .select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt })
        .from(users)
        .orderBy(asc(users.createdAt))
        .all()
        .map((u) => ({
            ...u,
            providers: providersByUser.get(u.id) ?? [],
            shareCount: usage.get(u.id)?.count ?? 0,
            totalBytes: usage.get(u.id)?.bytes ?? 0
        }));
};

export const userRoutes = new Hono<AppEnv>()
    .use('/users', requireSuperadmin)
    .use('/users/*', requireSuperadmin)
    .get('/users', (c) => c.json({ users: listUsers() }))
    .delete('/users/:id', (c) => {
        const db = getDb();
        const target = db.select().from(users).where(eq(users.id, c.req.param('id'))).get();
        if (!target) return c.json({ error: 'not_found' }, 404);
        if (target.role === 'superadmin') return c.json({ error: 'The superadmin cannot be removed' }, 400);

        const shareIds = db.transaction((tx) => {
            const ids = tx.select({ id: shares.id }).from(shares).where(eq(shares.ownerId, target.id)).all().map((s) => s.id);
            tx.delete(sessions).where(eq(sessions.userId, target.id)).run();
            tx.delete(shares).where(eq(shares.ownerId, target.id)).run();
            tx.delete(accounts).where(eq(accounts.userId, target.id)).run();
            tx.delete(invites).where(eq(invites.email, target.email)).run();
            tx.delete(users).where(eq(users.id, target.id)).run();
            return ids;
        });
        // After commit: a failed transaction must never orphan live rows without their blobs.
        for (const id of shareIds) removeBlob(id);

        return c.json({ users: listUsers() });
    });
