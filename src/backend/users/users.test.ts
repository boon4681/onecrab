import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '#backend/db/index.js';
import { accounts, invites, sessions, shares, users } from '#backend/db/schema.js';
import { app } from '../app';
import { createSession, SESSION_COOKIE } from '../auth/session';
import { createShare, filesDir } from '../shares/service';

let admin: { id: string; cookie: string };

const cookieFor = (userId: string) => `${SESSION_COOKIE}=${createSession(userId).token}`;

beforeAll(() => {
    const row = getDb().insert(users).values({ email: 'root@example.com', role: 'superadmin' }).returning().get();
    admin = { id: row.id, cookie: cookieFor(row.id) };
});

const del = (id: string, cookie?: string) =>
    app.request(`/api/users/${id}`, { method: 'DELETE', headers: { origin: 'http://localhost', ...(cookie ? { cookie } : {}) } });

const makeUser = (email: string) => {
    const db = getDb();
    const user = db.insert(users).values({ email, role: 'user' }).returning().get();
    db.insert(invites).values({ email }).run();
    db.insert(accounts).values({ provider: 'github', providerUserId: `gh-${email}`, userId: user.id }).run();
    return user;
};

describe('GET /api/users', () => {
    it('lists users with providers, share count and bytes', async () => {
        const user = makeUser('lister@example.com');
        await createShare({ ownerId: user.id, name: 'a.txt', type: 'text/plain', bytes: Buffer.from('12345') });
        const res = await app.request('/api/users', { headers: { cookie: admin.cookie } });
        expect(res.status).toBe(200);
        const { users: list } = await res.json();
        expect(list.find((u: { email: string }) => u.email === 'lister@example.com')).toMatchObject({
            role: 'user',
            providers: ['github'],
            shareCount: 1,
            totalBytes: 5
        });
    });

    it('is superadmin only', async () => {
        const user = makeUser('plain@example.com');
        expect((await app.request('/api/users', { headers: { cookie: cookieFor(user.id) } })).status).toBe(403);
        expect((await app.request('/api/users')).status).toBe(403);
    });
});

describe('DELETE /api/users/:id', () => {
    it('cascades sessions, shares, blobs, accounts and invite, and ends the session', async () => {
        const user = makeUser('gone@example.com');
        const userCookie = cookieFor(user.id);
        const a = await createShare({ ownerId: user.id, name: 'a.txt', type: 'text/plain', bytes: Buffer.from('a') });
        const b = await createShare({ ownerId: user.id, name: 'b.txt', type: 'text/plain', bytes: Buffer.from('b') });
        expect(existsSync(join(filesDir(), a.id))).toBe(true);

        const res = await del(user.id, admin.cookie);
        expect(res.status).toBe(200);

        const db = getDb();
        expect(db.select().from(users).where(eq(users.id, user.id)).get()).toBeUndefined();
        expect(db.select().from(sessions).where(eq(sessions.userId, user.id)).all()).toHaveLength(0);
        expect(db.select().from(shares).where(eq(shares.ownerId, user.id)).all()).toHaveLength(0);
        expect(db.select().from(accounts).where(eq(accounts.userId, user.id)).all()).toHaveLength(0);
        expect(db.select().from(invites).where(eq(invites.email, 'gone@example.com')).get()).toBeUndefined();
        expect(existsSync(join(filesDir(), a.id))).toBe(false);
        expect(existsSync(join(filesDir(), b.id))).toBe(false);

        const me = await app.request('/api/auth/me', { headers: { cookie: userCookie } });
        expect((await me.json()).user).toBeNull();
    });

    it('leaves other users untouched', async () => {
        const keep = makeUser('keep@example.com');
        const share = await createShare({ ownerId: keep.id, name: 'k.txt', type: 'text/plain', bytes: Buffer.from('k') });
        const victim = makeUser('victim@example.com');
        await del(victim.id, admin.cookie);
        expect(getDb().select().from(shares).where(eq(shares.id, share.id)).get()).toBeDefined();
        expect(existsSync(join(filesDir(), share.id))).toBe(true);
    });

    it('404s for unknown users', async () => {
        expect((await del('nope', admin.cookie)).status).toBe(404);
    });

    it('refuses to remove the superadmin', async () => {
        expect((await del(admin.id, admin.cookie)).status).toBe(400);
        expect(getDb().select().from(users).where(eq(users.id, admin.id)).get()).toBeDefined();
    });

    it('is superadmin only', async () => {
        const user = makeUser('sneaky@example.com');
        const other = makeUser('target@example.com');
        expect((await del(other.id, cookieFor(user.id))).status).toBe(403);
        expect(getDb().select().from(users).where(eq(users.id, other.id)).get()).toBeDefined();
    });
});
