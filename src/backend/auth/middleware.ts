import { createMiddleware } from 'hono/factory';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { User } from '#backend/db/schema.js';
import { SESSION_COOKIE, validateSession } from './session';

export type AppEnv = { Variables: { user: User | null }; Bindings: { clientAddress?: string } };

const isHttps = (c: Context) => new URL(c.req.url).protocol === 'https:';

export const writeSessionCookie = (c: Context, token: string, expiresAt: Date) => {
    setCookie(c, SESSION_COOKIE, token, {
        httpOnly: true,
        secure: isHttps(c),
        sameSite: 'Lax',
        path: '/',
        expires: expiresAt
    });
};

export const clearSessionCookie = (c: Context) => deleteCookie(c, SESSION_COOKIE, { path: '/' });

export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const session = validateSession(token);
    c.set('user', session?.user ?? null);
    if (token && !session) clearSessionCookie(c);
    if (token && session?.refreshed) writeSessionCookie(c, token, session.expiresAt);
    await next();
});

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
    if (!c.get('user')) return c.json({ error: 'unauthorized' }, 401);
    await next();
});

export const requireSuperadmin = createMiddleware<AppEnv>(async (c, next) => {
    if (c.get('user')?.role !== 'superadmin') return c.json({ error: 'forbidden' }, 403);
    await next();
});
