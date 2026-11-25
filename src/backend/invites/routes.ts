import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '#backend/db/index.js';
import { invites, users } from '#backend/db/schema.js';
import { requireSuperadmin, type AppEnv } from '../auth/middleware';
import { validate } from '../lib/validate';

const inviteBody = z.object({ email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')) });

const listInvites = () =>
    getDb()
        .select({ email: invites.email, createdAt: invites.createdAt, userId: users.id })
        .from(invites)
        .leftJoin(users, eq(users.email, invites.email))
        .orderBy(desc(invites.createdAt))
        .all()
        .map((i) => ({ email: i.email, createdAt: i.createdAt, joined: !!i.userId, userId: i.userId }));

export const inviteRoutes = new Hono<AppEnv>()
    .use('/invites', requireSuperadmin)
    .use('/invites/*', requireSuperadmin)
    .get('/invites', (c) => c.json({ invites: listInvites() }))
    .post('/invites', validate('json', inviteBody), (c) => {
        const { email } = c.req.valid('json');
        const db = getDb();
        if (db.select().from(users).where(eq(users.email, email)).get()?.role === 'superadmin') {
            return c.json({ error: 'That is the superadmin email' }, 400);
        }
        db.insert(invites).values({ email }).onConflictDoNothing().run();
        return c.json({ invites: listInvites() }, 201);
    })
    .delete('/invites/:email', (c) => {
        const email = decodeURIComponent(c.req.param('email')).toLowerCase();
        const removed = getDb().delete(invites).where(eq(invites.email, email)).returning().get();
        if (!removed) return c.json({ error: 'not_found' }, 404);
        return c.json({ invites: listInvites() });
    });
