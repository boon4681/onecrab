import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { sessionMiddleware, type AppEnv } from './auth/middleware';
import { authRoutes } from './auth/routes';
import { avatarRoutes } from './avatar';
import { hasSuperadmin } from './auth/setup';
import { shareRoutes } from './shares/routes';
import { providerRoutes } from './providers/routes';
import { signinRoutes } from './signin/routes';
import { inviteRoutes } from './invites/routes';
import { userRoutes } from './users/routes';

export const app = new Hono<AppEnv>().basePath('/api');

app.use(csrf());
app.use(sessionMiddleware);
app.use(async (c, next) => {
    const path = c.req.path;
    if (!hasSuperadmin() && !path.startsWith('/api/setup/') && path !== '/api/health') {
        return c.json({ error: 'setup_pending' }, 503);
    }
    await next();
});

app.get('/health', (c) => c.json({ ok: true }));
app.route('/', authRoutes);
app.route('/', avatarRoutes);
app.route('/', shareRoutes);
app.route('/', providerRoutes);
app.route('/', signinRoutes);
app.route('/', inviteRoutes);
app.route('/', userRoutes);
