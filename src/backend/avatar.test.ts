import { describe, expect, it } from 'vitest';
import { getDb } from '#backend/db/index.js';
import { users } from '#backend/db/schema.js';
import { app } from './app';

describe('GET /api/avatar/:userId', () => {
    const email = 'Avatar.Person@example.com';

    it('serves an svg without leaking the email', async () => {
        const db = getDb();
        db.insert(users).values({ email: 'root@example.com', role: 'superadmin' }).run();
        const user = db.insert(users).values({ email, role: 'user' }).returning().get();

        const res = await app.request(`/api/avatar/${user.id}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('image/svg+xml');
        expect(res.headers.get('cache-control')).toContain('max-age=86400');
        const body = await res.text();
        expect(body).toContain('<svg');
        expect(body.toLowerCase()).not.toContain(email.toLowerCase());
    });

    it('returns 404 for an unknown id', async () => {
        const res = await app.request('/api/avatar/nope');
        expect(res.status).toBe(404);
    });
});
