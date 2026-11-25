import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { and, eq, isNotNull } from 'drizzle-orm';
import { getDb } from '#backend/db/index.js';
import { users } from '#backend/db/schema.js';
import { hashPassword, verifyPassword } from '../lib/password';
import { validate } from '../lib/validate';
import { loginBody, setupBody } from './schemas';
import { clearLimit, clientIp, recordFailure, retryAfterSeconds, tooManyAttempts, type Limit } from '../lib/rate-limit';
import { clearSessionCookie, writeSessionCookie, type AppEnv } from './middleware';
import { createSession, deleteSession, SESSION_COOKIE } from './session';
import { completeReset, completeSetup, resolveLink } from './setup';

// Verifying against a throwaway hash keeps "unknown email" as slow as "wrong password".
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword('dummy-password-for-timing'));

const loginLimit = (ip: string): Limit => ({ key: `login:${ip}`, max: 5, windowMs: 15 * 60_000 });

export const authRoutes = new Hono<AppEnv>()
    .post('/setup/:a/:b', validate('json', setupBody), async (c) => {
        const { a, b } = c.req.param();
        const purpose = resolveLink(a, b);
        if (!purpose) return c.json({ error: 'not_found' }, 404);

        const { email, password } = c.req.valid('json');

        if (purpose === 'reset') {
            const admin = await completeReset(a, b, password);
            if (!admin) return c.json({ error: 'not_found' }, 404);
            return c.json({ ok: true });
        }

        if (!email) return c.json({ error: 'Invalid email' }, 400);
        const user = await completeSetup(a, b, email, password);
        if (!user) return c.json({ error: 'not_found' }, 404);

        const session = createSession(user.id);
        writeSessionCookie(c, session.token, session.expiresAt);
        return c.json({ ok: true });
    })
    .post('/auth/login', validate('json', loginBody), async (c) => {
        const limit = loginLimit(clientIp(c));
        const retryAfter = retryAfterSeconds(limit);
        if (retryAfter > 0) return tooManyAttempts(c, retryAfter);

        const { email, password } = c.req.valid('json');

        const user = getDb()
            .select()
            .from(users)
            .where(and(eq(users.email, email), isNotNull(users.passwordHash)))
            .get();
        const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
        if (!user || !ok) {
            recordFailure(limit);
            return c.json({ error: 'Invalid email or password' }, 401);
        }
        clearLimit(limit);

        const session = createSession(user.id);
        writeSessionCookie(c, session.token, session.expiresAt);
        return c.json({ ok: true });
    })
    .post('/auth/logout', (c) => {
        const token = getCookie(c, SESSION_COOKIE);
        if (token) deleteSession(token);
        clearSessionCookie(c);
        return c.json({ ok: true });
    })
    .get('/auth/me', (c) => {
        const user = c.get('user');
        return c.json({ user: user ? { id: user.id, email: user.email, role: user.role } : null });
    });
