import { existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '#backend/db/index.js';
import { rateLimits, shares, users } from '#backend/db/schema.js';
import { app } from '../app';
import { createSession, SESSION_COOKIE } from '../auth/session';
import { generatePasscode, isValidPasscode } from './crypto';
import { createShare, filesDir, MAX_FILE_BYTES } from './service';
import { sweep } from './sweep';

let cookie: string;
let ownerId: string;

beforeAll(() => {
    const owner = getDb().insert(users).values({ email: 'owner@example.com', role: 'superadmin' }).returning().get();
    ownerId = owner.id;
    cookie = `${SESSION_COOKIE}=${createSession(owner.id).token}`;
});

const upload = (
    bytes: Uint8Array<ArrayBuffer>,
    name = 'hello.txt',
    passcode?: string,
    withCookie = true,
    fields: Record<string, string> = {},
    as = cookie
) => {
    const form = new FormData();
    form.set('file', new File([bytes], name, { type: 'text/plain' }));
    if (passcode !== undefined) form.set('passcode', passcode);
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    return app.request('/api/shares', {
        method: 'POST',
        body: form,
        headers: { origin: 'http://localhost', ...(withCookie ? { cookie: as } : {}) }
    });
};

const download = (id: string, passcode: string, clientAddress?: string) =>
    app.request(
        `/api/shares/${id}/download`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ passcode })
        },
        { clientAddress }
    );

describe('passcodes', () => {
    it('generates 6 unambiguous characters with a letter and a digit', () => {
        for (let i = 0; i < 200; i++) {
            const p = generatePasscode();
            expect(p).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
            expect(isValidPasscode(p)).toBe(true);
        }
    });

    it('enforces length, charset and letter+digit', () => {
        expect(isValidPasscode('abc123')).toBe(true);
        expect(isValidPasscode('abcdef')).toBe(false);
        expect(isValidPasscode('123456')).toBe(false);
        expect(isValidPasscode('ab12')).toBe(false);
        expect(isValidPasscode('abc 123')).toBe(false);
    });
});

describe('upload and download', () => {
    it('requires a session to upload', async () => {
        expect((await upload(new Uint8Array([1]), 'x', undefined, false)).status).toBe(401);
    });

    it('round-trips a file with a generated passcode, in any case', async () => {
        const content = new TextEncoder().encode('secret contents');
        const res = await upload(content, 'héllo wörld.txt');
        expect(res.status).toBe(201);
        const { id, passcode } = await res.json();

        const onDisk = readFileSync(join(filesDir(), id));
        expect(onDisk.includes(Buffer.from('secret contents'))).toBe(false);

        const info = await (await app.request(`/api/shares/${id}`)).json();
        expect(info).toMatchObject({ id, size: content.length, ownerId });
        expect(JSON.stringify(info)).not.toContain('llo');

        const ok = await download(id, passcode.toLowerCase());
        expect(ok.status).toBe(200);
        expect(Buffer.from(await ok.arrayBuffer()).toString()).toBe('secret contents');
        expect(ok.headers.get('content-disposition')).toContain(encodeURIComponent('héllo wörld.txt'));
    });

    it('accepts a valid custom passcode and rejects an invalid one', async () => {
        expect((await upload(new Uint8Array([1, 2, 3]), 'a.bin', 'abcdef')).status).toBe(400);
        const res = await upload(new Uint8Array([1, 2, 3]), 'a.bin', 'crab42');
        const { id, passcode } = await res.json();
        expect(passcode).toBe('CRAB42');
        expect((await download(id, 'Crab42')).status).toBe(200);
    });

    it('rejects a wrong passcode', async () => {
        const { id } = await (await upload(new Uint8Array([9]), 'a', 'right1')).json();
        expect((await download(id, 'wrong1')).status).toBe(403);
        expect((await download(id, '')).status).toBe(403);
    });

    it('rejects files over 5 MB', async () => {
        expect((await upload(new Uint8Array(MAX_FILE_BYTES + 1))).status).toBe(413);
        expect((await upload(new Uint8Array(MAX_FILE_BYTES))).status).toBe(201);
    });

    it('binds ciphertext to its share id', async () => {
        const a = await createShare({ ownerId, name: 'a', type: 't', bytes: Buffer.from('AAA'), passcode: 'same11' });
        const b = await createShare({ ownerId, name: 'b', type: 't', bytes: Buffer.from('BBB'), passcode: 'same11' });
        const rowA = getDb().select().from(shares).where(eq(shares.id, a.id)).get()!;
        getDb()
            .update(shares)
            .set({ salt: rowA.salt, fileIv: rowA.fileIv, sealedMeta: rowA.sealedMeta, size: rowA.size })
            .where(eq(shares.id, b.id))
            .run();
        writeFileSync(join(filesDir(), b.id), readFileSync(join(filesDir(), a.id)));

        expect((await download(b.id, 'same11')).status).toBe(403);
    });

    it('404s unknown and expired shares', async () => {
        expect((await app.request('/api/shares/nope')).status).toBe(404);
        const { id } = await createShare({ ownerId, name: 'x', type: 't', bytes: Buffer.from('x'), passcode: 'abc123' });
        getDb().update(shares).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(shares.id, id)).run();
        expect((await app.request(`/api/shares/${id}`)).status).toBe(404);
        expect((await download(id, 'abc123')).status).toBe(404);
    });
});

describe('share lifecycle', () => {
    const makeUser = (email: string) => {
        const u = getDb().insert(users).values({ email, role: 'user' }).returning().get();
        return { id: u.id, cookie: `${SESSION_COOKIE}=${createSession(u.id).token}` };
    };
    const row = (id: string) => getDb().select().from(shares).where(eq(shares.id, id)).get();
    const insertFiller = (ownerId: string, n: number) => {
        for (let i = 0; i < n; i++) {
            getDb()
                .insert(shares)
                .values({
                    ownerId,
                    id: `filler-${ownerId}-${i}`,
                    size: 1,
                    salt: Buffer.alloc(16),
                    fileIv: Buffer.alloc(12),
                    sealedMeta: Buffer.alloc(32),
                    expiresAt: new Date(Date.now() + 60_000)
                })
                .run();
        }
    };

    it('validates ttl and sets the expiry', async () => {
        const bad = await upload(new Uint8Array([1]), 'a', undefined, true, { ttl: '31d' });
        expect(bad.status).toBe(400);

        const { id } = await (await upload(new Uint8Array([1]), 'a', undefined, true, { ttl: '1h' })).json();
        expect(row(id)!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);

        const def = await (await upload(new Uint8Array([1]))).json();
        const week = row(def.id)!.expiresAt.getTime() - Date.now();
        expect(week).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    });

    it('validates maxDownloads', async () => {
        for (const bad of ['0', '-1', '1.5', 'abc', '1001']) {
            expect((await upload(new Uint8Array([1]), 'a', undefined, true, { maxDownloads: bad })).status).toBe(400);
        }
        const ok = await upload(new Uint8Array([1]), 'a', undefined, true, { maxDownloads: '1000' });
        expect(row((await ok.json()).id)!.maxDownloads).toBe(1000);
    });

    it('stops serving after max downloads and counts only successful ones', async () => {
        const res = await upload(new Uint8Array([7]), 'a', 'limit1', true, { maxDownloads: '2' });
        const { id } = await res.json();
        expect((await download(id, 'wrong1')).status).toBe(403);
        expect(row(id)!.downloads).toBe(0);
        expect((await download(id, 'limit1')).status).toBe(200);
        expect((await download(id, 'limit1')).status).toBe(200);
        expect(row(id)!.downloads).toBe(2);
        expect((await download(id, 'limit1')).status).toBe(404);
        expect((await app.request(`/api/shares/${id}`)).status).toBe(404);
    });

    it('lets only one of several concurrent downloads take the last slot', async () => {
        const { id } = await (await upload(new Uint8Array([7]), 'a', 'race11', true, { maxDownloads: '1' })).json();
        const statuses = (await Promise.all([1, 2, 3, 4].map(() => download(id, 'race11')))).map((r) => r.status);
        expect(statuses.filter((s) => s === 200)).toHaveLength(1);
        expect(row(id)!.downloads).toBe(1);
    });

    it('sweeps expired and exhausted rows, their blobs, and orphan files', async () => {
        const expired = await createShare({ ownerId, name: 'x', type: 't', bytes: Buffer.from('x') });
        const exhausted = await createShare({ ownerId, name: 'x', type: 't', bytes: Buffer.from('x'), maxDownloads: 1 });
        const live = await createShare({ ownerId, name: 'x', type: 't', bytes: Buffer.from('x') });
        getDb().update(shares).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(shares.id, expired.id)).run();
        getDb().update(shares).set({ downloads: 1 }).where(eq(shares.id, exhausted.id)).run();

        const orphan = join(filesDir(), 'orphan-blob');
        const freshTmp = join(filesDir(), 'fresh.tmp');
        const staleTmp = join(filesDir(), 'stale.tmp');
        writeFileSync(orphan, 'x');
        writeFileSync(freshTmp, 'x');
        writeFileSync(staleTmp, 'x');
        const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
        utimesSync(staleTmp, old, old);

        sweep();

        for (const s of [expired, exhausted]) {
            expect(row(s.id)).toBeUndefined();
            expect(existsSync(join(filesDir(), s.id))).toBe(false);
        }
        expect(row(live.id)).toBeDefined();
        expect(existsSync(join(filesDir(), live.id))).toBe(true);
        expect(existsSync(orphan)).toBe(false);
        expect(existsSync(staleTmp)).toBe(false);
        expect(existsSync(freshTmp)).toBe(true);
    });

    it('caps a user at 50 active shares', async () => {
        const u = makeUser('capped@example.com');
        insertFiller(u.id, 49);
        expect((await upload(new Uint8Array([1]), 'a', undefined, true, {}, u.cookie)).status).toBe(201);
        const res = await upload(new Uint8Array([1]), 'a', undefined, true, {}, u.cookie);
        expect(res.status).toBe(409);
        expect((await res.json()).error).toContain('50');
    });

    it('does not count expired shares toward the cap', async () => {
        const u = makeUser('capped2@example.com');
        insertFiller(u.id, 50);
        getDb().update(shares).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(shares.ownerId, u.id)).run();
        expect((await upload(new Uint8Array([1]), 'a', undefined, true, {}, u.cookie)).status).toBe(201);
    });

    it('lists own shares, and all shares only for the superadmin with all=1', async () => {
        const u = makeUser('lister@example.com');
        const mine = await (await upload(new Uint8Array([1]), 'a', undefined, true, {}, u.cookie)).json();

        const ownRes = await app.request('/api/shares', { headers: { cookie: u.cookie } });
        const own = (await ownRes.json()).shares;
        expect(own.map((s: { id: string }) => s.id)).toEqual([mine.id]);
        expect(own[0]).toMatchObject({ size: 1, downloads: 0, maxDownloads: null });
        expect(own[0]).not.toHaveProperty('ownerId');

        const userAll = (await (await app.request('/api/shares?all=1', { headers: { cookie: u.cookie } })).json()).shares;
        expect(userAll).toHaveLength(1);

        const adminAll = (await (await app.request('/api/shares?all=1', { headers: { cookie } })).json()).shares;
        expect(adminAll.find((s: { id: string }) => s.id === mine.id)).toMatchObject({ ownerId: u.id });
        expect((await app.request('/api/shares')).status).toBe(401);
    });

    it('lets the owner and superadmin delete, and hides shares from others', async () => {
        const a = makeUser('a-del@example.com');
        const b = makeUser('b-del@example.com');
        const del = (id: string, as?: string) =>
            app.request(`/api/shares/${id}`, {
                method: 'DELETE',
                headers: { origin: 'http://localhost', ...(as ? { cookie: as } : {}) }
            });

        const first = await (await upload(new Uint8Array([1]), 'a', undefined, true, {}, a.cookie)).json();
        expect((await del(first.id)).status).toBe(401);
        expect((await del(first.id, b.cookie)).status).toBe(404);
        expect(row(first.id)).toBeDefined();
        expect((await del(first.id, a.cookie)).status).toBe(200);
        expect(row(first.id)).toBeUndefined();
        expect(existsSync(join(filesDir(), first.id))).toBe(false);
        expect((await del(first.id, a.cookie)).status).toBe(404);

        const second = await (await upload(new Uint8Array([1]), 'a', undefined, true, {}, a.cookie)).json();
        expect((await del(second.id, cookie)).status).toBe(200);
        expect(row(second.id)).toBeUndefined();
    });
});

describe('guess limit', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    const newShare = async () => (await (await upload(new Uint8Array([9]), 'a', 'right11')).json()).id as string;

    it('refuses the 6th guess from one IP, even a correct one, with retry-after', async () => {
        const id = await newShare();
        for (let i = 0; i < 5; i++) expect((await download(id, 'wrong1', '10.0.0.1')).status).toBe(403);

        const res = await download(id, 'right11', '10.0.0.1');
        expect(res.status).toBe(429);
        const body = await res.json();
        expect(body.retryAfter).toBeGreaterThan(0);
        expect(body.retryAfter).toBeLessThanOrEqual(15 * 60);
        expect(res.headers.get('retry-after')).toBe(String(body.retryAfter));
        expect(getDb().select().from(shares).where(eq(shares.id, id)).get()!.downloads).toBe(0);
    });

    it('keeps IPs independent and shares independent', async () => {
        const id = await newShare();
        const other = await newShare();
        for (let i = 0; i < 5; i++) await download(id, 'wrong1', '10.0.0.2');
        expect((await download(id, 'wrong1', '10.0.0.2')).status).toBe(429);
        expect((await download(id, 'right11', '10.0.0.3')).status).toBe(200);
        expect((await download(other, 'right11', '10.0.0.2')).status).toBe(200);
    });

    it('lets the IP guess again once 15 minutes have passed', async () => {
        const id = await newShare();
        vi.useFakeTimers({ toFake: ['Date'] });
        for (let i = 0; i < 5; i++) await download(id, 'wrong1', '10.0.0.4');
        expect((await download(id, 'right11', '10.0.0.4')).status).toBe(429);

        vi.setSystemTime(Date.now() + 15 * 60_000 - 1000);
        expect((await download(id, 'right11', '10.0.0.4')).status).toBe(429);
        vi.setSystemTime(Date.now() + 2000);
        expect((await download(id, 'right11', '10.0.0.4')).status).toBe(200);
    });

    it('caps a share at 100 failures per 24 hours across IPs, then recovers', async () => {
        const id = await newShare();
        vi.useFakeTimers({ toFake: ['Date'] });
        for (let i = 0; i < 100; i++) {
            expect((await download(id, 'wrong1', `10.1.${Math.floor(i / 5)}.1`)).status).toBe(403);
        }

        const res = await download(id, 'right11', '10.2.0.1');
        expect(res.status).toBe(429);
        expect((await res.json()).retryAfter).toBeGreaterThan(60 * 60);

        vi.setSystemTime(Date.now() + 24 * 60 * 60_000 + 1000);
        expect((await download(id, 'right11', '10.2.0.1')).status).toBe(200);
    });

    it('sweep removes expired counters only', () => {
        const db = getDb();
        db.insert(rateLimits).values({ key: 'stale', count: 5, expiresAt: new Date(Date.now() - 1000) }).run();
        db.insert(rateLimits).values({ key: 'live', count: 1, expiresAt: new Date(Date.now() + 60_000) }).run();
        sweep();
        const keys = db.select().from(rateLimits).all().map((r) => r.key);
        expect(keys).not.toContain('stale');
        expect(keys).toContain('live');
    });
});
