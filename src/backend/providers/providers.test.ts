import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getDb } from '#backend/db/index.js';
import { users } from '#backend/db/schema.js';
import { app } from '../app';
import { createSession, SESSION_COOKIE } from '../auth/session';
import { mapTokenError, probeProvider } from './probe';
import { getProvider, listEnabledProviders, onProviderChange, saveProvider } from './service';

const ORIGIN = 'https://crab.example';
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const tokenFetch = (error: string) => vi.fn(async () => json({ error }, 400)) as unknown as typeof fetch;

describe('mapTokenError', () => {
    it.each([
        ['invalid_grant', true],
        ['bad_verification_code', true],
        ['invalid_client', false],
        ['incorrect_client_credentials', false],
        ['unauthorized_client', false],
        ['redirect_uri_mismatch', false],
        [undefined, false]
    ])('%s -> ok=%s', (error, ok) => {
        expect(mapTokenError(error).ok).toBe(ok);
    });
});

describe('probeProvider', () => {
    it('posts a fake code with client credentials to Google', async () => {
        const fetchFn = tokenFetch('invalid_grant');
        const result = await probeProvider(
            { type: 'google', clientId: 'id', clientSecret: 'secret' },
            `${ORIGIN}/api/auth/callback/google`,
            fetchFn
        );
        expect(result.ok).toBe(true);
        const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(url).toBe('https://oauth2.googleapis.com/token');
        const body = new URLSearchParams(String(init.body));
        expect(body.get('client_secret')).toBe('secret');
        expect(body.get('redirect_uri')).toBe(`${ORIGIN}/api/auth/callback/google`);
    });

    it('reads GitHub 200 responses that carry an error', async () => {
        const fetchFn = vi.fn(async () => json({ error: 'incorrect_client_credentials' })) as unknown as typeof fetch;
        const result = await probeProvider({ type: 'github', clientId: 'id', clientSecret: 'bad' }, 'cb', fetchFn);
        expect(result).toEqual({ ok: false, message: 'Client ID or secret was rejected' });
    });

    const oidc = { type: 'oidc' as const, clientId: 'id', clientSecret: 's', tokenUrl: 'https://idp.example/token' };

    it('uses the OIDC token URL and remembers post when the server accepts it', async () => {
        const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => json({ error: 'invalid_grant' }, 400));
        const result = await probeProvider(oidc, 'cb', fetchFn as unknown as typeof fetch);
        expect(result).toMatchObject({ ok: true, authMethod: 'post' });
        expect(fetchFn.mock.calls[0][0]).toBe('https://idp.example/token');
    });

    it('falls back to basic auth when the server rejects credentials in the body', async () => {
        const fetchFn = vi.fn(async (_url: string, init?: RequestInit) =>
            (init!.headers as Record<string, string>).authorization
                ? json({ error: 'invalid_grant' }, 400)
                : json({ error: 'invalid_client' }, 401)
        );
        const result = await probeProvider(oidc, 'cb', fetchFn as unknown as typeof fetch);
        expect(result).toMatchObject({ ok: true, authMethod: 'basic' });
        expect((fetchFn.mock.calls[1][1]!.headers as Record<string, string>).authorization).toBe(
            `Basic ${Buffer.from('id:s').toString('base64')}`
        );
    });

    it('fails OIDC when both styles are rejected', async () => {
        const fetchFn = vi.fn(async () => json({ error: 'invalid_client' }, 401)) as unknown as typeof fetch;
        expect(await probeProvider(oidc, 'cb', fetchFn)).toEqual({ ok: false, message: 'Client ID or secret was rejected' });
    });

    it('fails cleanly when the network is down', async () => {
        const fetchFn = vi.fn(async () => {
            throw new Error('offline');
        }) as unknown as typeof fetch;
        const result = await probeProvider({ type: 'google', clientId: 'id', clientSecret: 's' }, 'cb', fetchFn);
        expect(result).toEqual({ ok: false, message: 'Could not reach the token endpoint (offline)' });
    });
});

describe('saveProvider', () => {
    it('enables only after a passing test, and an edit re-disables until it passes', async () => {
        const changed = vi.fn();
        onProviderChange(changed);

        const good = await saveProvider('google', { clientId: 'id', clientSecret: 's' }, ORIGIN, tokenFetch('invalid_grant'));
        expect(good).toMatchObject({ enabled: true, lastTestOk: true });
        expect(listEnabledProviders()).toEqual([{ type: 'google', name: 'Google' }]);

        const bad = await saveProvider('google', { clientId: 'id2' }, ORIGIN, tokenFetch('invalid_client'));
        expect(bad).toMatchObject({ enabled: false, lastTestOk: false, clientSecret: 's' });
        expect(listEnabledProviders()).toEqual([]);
        expect(changed).toHaveBeenCalledWith('google');
    });

    it('requires a secret for a new provider and all three endpoints for OIDC', async () => {
        expect(await saveProvider('github', { clientId: 'id' }, ORIGIN)).toEqual({ error: 'Client secret is required' });
        expect(
            await saveProvider('oidc', { clientId: 'id', clientSecret: 's', tokenUrl: 'https://idp.example/token' }, ORIGIN)
        ).toEqual({ error: 'Authorization URL, Token URL and User info URL are required' });
        expect(getProvider('github')).toBeNull();
    });
});

describe('provider routes', () => {
    let cookie: string;
    let userCookie: string;

    beforeAll(() => {
        const db = getDb();
        const admin = db.insert(users).values({ email: 'root@example.com', role: 'superadmin' }).returning().get();
        const user = db.insert(users).values({ email: 'u@example.com', role: 'user' }).returning().get();
        cookie = `${SESSION_COOKIE}=${createSession(admin.id).token}`;
        userCookie = `${SESSION_COOKIE}=${createSession(user.id).token}`;
    });

    it('hides admin endpoints from non-superadmins and never returns secrets', async () => {
        expect((await app.request('/api/providers', { headers: { cookie: userCookie } })).status).toBe(403);
        const res = await app.request('/api/providers', { headers: { cookie } });
        const text = await res.text();
        expect(res.status).toBe(200);
        expect(text).not.toContain('"clientSecret"');
        expect(JSON.parse(text).providers.map((p: { type: string }) => p.type)).toEqual(['google', 'github', 'oidc']);
    });

    it('exposes only enabled providers publicly', async () => {
        const res = await app.request('/api/auth/providers');
        expect(await res.json()).toEqual({ providers: listEnabledProviders() });
    });
});

describe('probe diagnostics', () => {
    const oidc = { type: 'oidc' as const, clientId: 'id', clientSecret: 's', tokenUrl: 'https://idp.example/token' };

    it('explains a non-OAuth HTML response with status, type and body', async () => {
        const fetchFn = vi.fn(
            async () => new Response('<html><h1>Not Found</h1></html>', { status: 404, headers: { 'content-type': 'text/html' } })
        ) as unknown as typeof fetch;
        const result = await probeProvider(oidc, 'cb', fetchFn);
        expect(result.ok).toBe(false);
        expect(result.message).toContain('HTTP 404 (text/html)');
        expect(result.message).toContain('Check the Token URL');
        expect(result.message).toContain('Not Found');
    });

    it('flags a 200 that does not reject the fake code', async () => {
        const fetchFn = vi.fn(async () => json({ hello: 'world' })) as unknown as typeof fetch;
        const result = await probeProvider(oidc, 'cb', fetchFn);
        expect(result.message).toContain('may not be an OAuth2 token endpoint');
    });

    it('reports network error codes', async () => {
        const fetchFn = vi.fn(async () => {
            throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
        }) as unknown as typeof fetch;
        expect((await probeProvider(oidc, 'cb', fetchFn)).message).toBe('Could not reach the token endpoint (ENOTFOUND)');
    });
});
