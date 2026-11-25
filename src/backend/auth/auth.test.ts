import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { hashPassword, verifyPassword } from '../lib/password';
import { createSession, SESSION_COOKIE, validateSession } from './session';
import { getDb } from '#backend/db/index.js';
import { rateLimits } from '#backend/db/schema.js';
import { sweep } from '../shares/sweep';
import { createResetLink, ensureSetupLink } from './setup';

const ADMIN = { email: 'Admin@Example.com', password: 'correct horse battery' };

const post = (path: string, body: unknown, cookie?: string) =>
    app.request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body)
    });

const sessionCookie = (res: Response) => {
    const match = res.headers.get('set-cookie')?.match(new RegExp(`${SESSION_COOKIE}=([^;]*)`));
    return match?.[1] ? `${SESSION_COOKIE}=${match[1]}` : undefined;
};

const me = async (cookie?: string) => {
    const res = await app.request('/api/auth/me', { headers: cookie ? { cookie } : {} });
    return (await res.json()).user;
};

afterEach(() => {
    vi.useRealTimers();
});

describe('password', () => {
    it('verifies the right password and rejects a wrong one', async () => {
        const hash = await hashPassword('hunter2hunter2');
        expect(hash).toMatch(/^\$argon2id\$/);
        expect(await verifyPassword('hunter2hunter2', hash)).toBe(true);
        expect(await verifyPassword('hunter3hunter3', hash)).toBe(false);
    });
});

describe('setup, login, logout, reset', () => {
    let setupPath: string;
    let adminCookie: string | undefined;

    it('blocks the API until setup is done', async () => {
        expect((await app.request('/api/health')).status).toBe(200);
        expect((await app.request('/api/auth/me')).status).toBe(503);
    });

    it('keeps the same setup link until it is used', () => {
        setupPath = ensureSetupLink()!;
        expect(setupPath).toMatch(/^\/setup\/[a-z0-9]+\/[a-z0-9]+$/);
        expect(ensureSetupLink()).toBe(setupPath);
    });

    it('rejects a wrong setup link', async () => {
        const [, , a] = setupPath.split('/');
        expect((await post(`/api/setup/${a}/nope`, ADMIN)).status).toBe(404);
    });

    it('rejects a short password', async () => {
        expect((await post(`/api${setupPath}`, { ...ADMIN, password: 'short' })).status).toBe(400);
    });

    it('creates the superadmin once and signs them in', async () => {
        const res = await post(`/api${setupPath}`, ADMIN);
        expect(res.status).toBe(200);
        adminCookie = sessionCookie(res);
        expect(await me(adminCookie)).toMatchObject({ email: 'admin@example.com', role: 'superadmin' });

        expect((await post(`/api${setupPath}`, ADMIN)).status).toBe(404);
        expect(ensureSetupLink()).toBeNull();
    });

    it('logs in with the right password only', async () => {
        expect((await post('/api/auth/login', { ...ADMIN, password: 'wrong password!' })).status).toBe(401);
        expect((await post('/api/auth/login', { email: 'nobody@example.com', password: 'x' })).status).toBe(401);
        const res = await post('/api/auth/login', ADMIN);
        expect(res.status).toBe(200);
        expect(sessionCookie(res)).toBeDefined();
    });

    it('logout invalidates the session', async () => {
        await post('/api/auth/logout', {}, adminCookie);
        expect(await me(adminCookie)).toBeNull();
    });

    it('reset link sets a new password, signs out old sessions and is single use', async () => {
        const cookie = sessionCookie(await post('/api/auth/login', ADMIN));
        const resetPath = createResetLink()!;

        expect((await post(`/api${resetPath}`, { password: 'brand new password' })).status).toBe(200);
        expect(await me(cookie)).toBeNull();
        expect((await post('/api/auth/login', ADMIN)).status).toBe(401);
        expect((await post('/api/auth/login', { ...ADMIN, password: 'brand new password' })).status).toBe(200);
        expect((await post(`/api${resetPath}`, { password: 'another password!!' })).status).toBe(404);
    });
});

describe('session expiry', () => {
    it('slides when less than half the TTL is left and expires after the TTL', async () => {
        const login = await post('/api/auth/login', { ...ADMIN, password: 'brand new password' });
        const token = sessionCookie(login)!.split('=')[1];
        const admin = validateSession(token)!.user;

        vi.useFakeTimers({ toFake: ['Date'] });
        const fresh = createSession(admin.id);

        vi.setSystemTime(Date.now() + 16 * 24 * 60 * 60 * 1000);
        const slid = validateSession(fresh.token)!;
        expect(slid.refreshed).toBe(true);
        expect(slid.expiresAt.getTime()).toBeGreaterThan(fresh.expiresAt.getTime());

        vi.setSystemTime(slid.expiresAt.getTime() + 1);
        expect(validateSession(fresh.token)).toBeNull();
    });
});

describe('login guess limit', () => {
    const login = (password: string, clientAddress: string) =>
        app.request(
            '/api/auth/login',
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ ...ADMIN, password })
            },
            { clientAddress }
        );
    const GOOD = 'brand new password';

    it('refuses the 6th failed login from an IP, even with the right password', async () => {
        for (let i = 0; i < 5; i++) expect((await login('nope nope nope', '9.9.9.1')).status).toBe(401);
        const res = await login(GOOD, '9.9.9.1');
        expect(res.status).toBe(429);
        const body = await res.json();
        expect(body.retryAfter).toBeGreaterThan(0);
        expect(res.headers.get('retry-after')).toBe(String(body.retryAfter));
        expect((await login(GOOD, '9.9.9.2')).status).toBe(200);
    });

    it('resets after 15 minutes and on a successful login', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        for (let i = 0; i < 5; i++) await login('nope nope nope', '9.9.9.3');
        expect((await login(GOOD, '9.9.9.3')).status).toBe(429);
        vi.setSystemTime(Date.now() + 15 * 60_000 + 1000);
        expect((await login(GOOD, '9.9.9.3')).status).toBe(200);

        for (let i = 0; i < 4; i++) await login('nope nope nope', '9.9.9.3');
        expect((await login(GOOD, '9.9.9.3')).status).toBe(200);
        for (let i = 0; i < 4; i++) expect((await login('nope nope nope', '9.9.9.3')).status).toBe(401);
    });

    it('sweep removes expired login counters', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.now() + 40 * 60_000);
        sweep();
        expect(getDb().select().from(rateLimits).all().filter((r) => r.key.startsWith('login:'))).toEqual([]);
    });
});
