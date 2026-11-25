import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '#backend/db/index.js';
import { accounts, invites, providers, users } from '#backend/db/schema.js';
import { app } from '../app';
import { createSession, SESSION_COOKIE } from '../auth/session';
import { setFetchForTests } from './flows';
import { resolveIdentity } from './identity';

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let adminCookie: string;

beforeAll(() => {
    const db = getDb();
    const admin = db.insert(users).values({ email: 'root@example.com', role: 'superadmin' }).returning().get();
    adminCookie = `${SESSION_COOKIE}=${createSession(admin.id).token}`;
    db.insert(providers)
        .values({ type: 'github', clientId: 'gh-id', clientSecret: 'gh-secret', enabled: true })
        .run();
});

const invite = (email: string) => getDb().insert(invites).values({ email }).onConflictDoNothing().run();

describe('resolveIdentity', () => {
    it('rejects unverified and uninvited emails without creating users', () => {
        expect(
            resolveIdentity({ provider: 'google', providerUserId: 'g1', email: 'a@x.com', emailVerified: false })
        ).toEqual({ error: 'email_unverified' });
        expect(
            resolveIdentity({ provider: 'google', providerUserId: 'g1', email: 'a@x.com', emailVerified: true })
        ).toEqual({ error: 'not_invited' });
        expect(getDb().select().from(users).where(eq(users.email, 'a@x.com')).get()).toBeUndefined();
    });

    it('creates an invited user and links further providers by email', () => {
        invite('b@x.com');
        const first = resolveIdentity({ provider: 'google', providerUserId: 'g2', email: 'B@x.com', emailVerified: true });
        const second = resolveIdentity({ provider: 'github', providerUserId: '42', email: 'b@x.com', emailVerified: true });
        expect('user' in first && 'user' in second && first.user.id === second.user.id).toBe(true);
        expect(getDb().select().from(accounts).all().filter((a) => a.providerUserId === 'g2' || a.providerUserId === '42')).toHaveLength(2);
    });

    it('never lets a provider sign in as the superadmin', () => {
        invite('root@example.com');
        expect(
            resolveIdentity({ provider: 'google', providerUserId: 'g3', email: 'root@example.com', emailVerified: true })
        ).toEqual({ error: 'admin_password_only' });
    });

    it('stops a linked account once its invite is removed', () => {
        invite('c@x.com');
        expect('user' in resolveIdentity({ provider: 'google', providerUserId: 'g4', email: 'c@x.com', emailVerified: true })).toBe(true);
        getDb().delete(invites).where(eq(invites.email, 'c@x.com')).run();
        expect(
            resolveIdentity({ provider: 'google', providerUserId: 'g4', email: 'c@x.com', emailVerified: true })
        ).toEqual({ error: 'not_invited' });
    });
});

describe('GitHub sign-in over HTTP', () => {
    const start = async () => {
        const res = await app.request('/api/auth/signin/github');
        expect(res.status).toBe(302);
        const location = new URL(res.headers.get('location')!);
        const cookie = res.headers.get('set-cookie')!.split(';')[0];
        return { state: location.searchParams.get('state')!, location, cookie };
    };

    const mockGitHub = (id: number, emails: unknown) =>
        setFetchForTests(
            vi.fn(async (url: string | URL | Request) => {
                const u = String(url);
                if (u.endsWith('/access_token')) return json({ access_token: 'tok' });
                if (u.endsWith('/user')) return json({ id });
                if (u.endsWith('/user/emails')) return json(emails);
                return json({}, 404);
            }) as unknown as typeof fetch
        );

    it('redirects to GitHub with scope, redirect_uri and state', async () => {
        const { location } = await start();
        expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
        expect(location.searchParams.get('scope')).toBe('read:user user:email');
        expect(location.searchParams.get('redirect_uri')).toBe('http://localhost/api/auth/callback/github');
    });

    it('signs in an invited user with a verified primary email', async () => {
        invite('gh@x.com');
        mockGitHub(777, [{ email: 'gh@x.com', primary: true, verified: true }]);
        const { state, cookie } = await start();
        const res = await app.request(`/api/auth/callback/github?code=abc&state=${state}`, { headers: { cookie } });
        expect(res.headers.get('location')).toBe('/');
        expect(res.headers.get('set-cookie')).toContain(SESSION_COOKIE);
    });

    it('rejects an unverified primary email', async () => {
        mockGitHub(778, [{ email: 'gh2@x.com', primary: true, verified: false }]);
        const { state, cookie } = await start();
        const res = await app.request(`/api/auth/callback/github?code=abc&state=${state}`, { headers: { cookie } });
        expect(res.headers.get('location')).toBe('/login?error=email_unverified');
    });

    it('rejects a state mismatch or missing flow cookie', async () => {
        const { cookie } = await start();
        const bad = await app.request('/api/auth/callback/github?code=abc&state=nope', { headers: { cookie } });
        expect(bad.headers.get('location')).toBe('/login?error=failed');
        const none = await app.request('/api/auth/callback/github?code=abc&state=x');
        expect(none.headers.get('location')).toBe('/login?error=failed');
    });

    it('only lets the superadmin start a test flow', async () => {
        const anon = await app.request('/api/auth/signin/github?test=1');
        expect(anon.headers.get('location')).toBe('/login?error=provider_unavailable');
        const admin = await app.request('/api/auth/signin/github?test=1', { headers: { cookie: adminCookie } });
        expect(admin.headers.get('location')).toContain('github.com');
    });
});

describe('invites API', () => {
    const post = (email: string) =>
        app.request('/api/invites', {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: adminCookie },
            body: JSON.stringify({ email })
        });

    it('adds, lists and removes invites, superadmin only', async () => {
        expect((await app.request('/api/invites')).status).toBe(403);
        expect((await post('not-an-email')).status).toBe(400);
        expect((await post('root@example.com')).status).toBe(400);
        const added = await post('New@Example.com');
        expect(added.status).toBe(201);
        expect((await added.json()).invites.some((i: { email: string }) => i.email === 'new@example.com')).toBe(true);
        const del = await app.request('/api/invites/new%40example.com', {
            method: 'DELETE',
            headers: { cookie: adminCookie, origin: 'http://localhost' }
        });
        expect(del.status).toBe(200);
    });
});

describe('generic OAuth2 / OIDC sign-in', () => {
    const IDP = 'https://idp.example';
    let tokenCall: RequestInit | undefined;

    beforeAll(() => {
        getDb()
            .insert(providers)
            .values({
                type: 'oidc',
                clientId: 'oidc-id',
                clientSecret: 'oidc-secret',
                authorizationUrl: `${IDP}/oauth/authorize?tenant=uni`,
                tokenUrl: `${IDP}/oauth/token`,
                userinfoUrl: `${IDP}/oauth/me`,
                tokenAuthMethod: 'basic',
                enabled: true,
                trustEmail: true
            })
            .run();
    });

    it('uses the configured endpoints, PKCE and a plain user endpoint', async () => {
        invite('student@uni.example');
        setFetchForTests(
            vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
                const u = String(url);
                if (u === `${IDP}/oauth/token`) {
                    tokenCall = init;
                    return json({ access_token: 'at', token_type: 'Bearer' });
                }
                if (u === `${IDP}/oauth/me`) return json({ id: 6501, email: 'student@uni.example' });
                return json({}, 404);
            }) as unknown as typeof fetch
        );

        const startRes = await app.request('/api/auth/signin/oidc');
        const location = new URL(startRes.headers.get('location')!);
        expect(location.origin + location.pathname).toBe(`${IDP}/oauth/authorize`);
        expect(location.searchParams.get('tenant')).toBe('uni');
        expect(location.searchParams.get('response_type')).toBe('code');
        expect(location.searchParams.get('code_challenge_method')).toBe('S256');
        const cookie = startRes.headers.get('set-cookie')!.split(';')[0];

        const state = location.searchParams.get('state');
        const res = await app.request(`/api/auth/callback/oidc?code=c1&state=${state}`, { headers: { cookie } });
        expect(res.headers.get('location')).toBe('/');
        expect(res.headers.get('set-cookie')).toContain(SESSION_COOKIE);

        const body = new URLSearchParams(String(tokenCall!.body));
        expect(body.get('code_verifier')).toBeTruthy();
        expect(body.get('client_secret')).toBeNull();
        expect((tokenCall!.headers as Record<string, string>).authorization).toMatch(/^Basic /);
    });

    it('enables a disabled provider after a successful Try sign-in, without PKCE when turned off', async () => {
        getDb().update(providers).set({ enabled: false, usePkce: false, scopes: 'profile email' }).where(eq(providers.type, 'oidc')).run();

        const startRes = await app.request('/api/auth/signin/oidc?test=1', { headers: { cookie: adminCookie } });
        const location = new URL(startRes.headers.get('location')!);
        expect(location.searchParams.get('code_challenge')).toBeNull();
        expect(location.searchParams.get('scope')).toBe('profile email');
        const cookie = startRes.headers.get('set-cookie')!.split(';')[0];

        const res = await app.request(`/api/auth/callback/oidc?code=c2&state=${location.searchParams.get('state')}`, {
            headers: { cookie }
        });
        expect(await res.text()).toContain('Sign-in works');
        expect(new URLSearchParams(String(tokenCall!.body)).get('code_verifier')).toBeNull();
        expect(getDb().select().from(providers).where(eq(providers.type, 'oidc')).get()).toMatchObject({
            enabled: true,
            lastTestOk: true
        });
    });
});
