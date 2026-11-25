import { blobatar } from 'blobatar';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '#backend/db/index.js';
import { users } from '#backend/db/schema.js';

export const avatarRoutes = new Hono().get('/avatar/:userId', (c) => {
    const user = getDb().select({ email: users.email }).from(users).where(eq(users.id, c.req.param('userId'))).get();
    if (!user) return c.json({ error: 'not_found' }, 404);

    return c.body(blobatar(user.email.toLowerCase(), { background: 'circle' }), 200, {
        'content-type': 'image/svg+xml',
        // Not "immutable": an email change would otherwise leave the old avatar stuck for a day.
        'cache-control': 'public, max-age=86400'
    });
});
