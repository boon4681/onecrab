import { Hono, type Context } from 'hono';
import { resolveOrigin } from '#backend/lib/origin.js';
import { requireSuperadmin, type AppEnv } from '../auth/middleware';
import { validate } from '../lib/validate';
import { providerBody } from './schemas';
import {
    deleteProvider,
    getProvider,
    isProviderType,
    listEnabledProviders,
    listProvidersForAdmin,
    saveProvider,
    testProvider,
    toPublicProvider
} from './service';

export const publicOrigin = (c: Context) => resolveOrigin(c.req.raw);

export const providerRoutes = new Hono<AppEnv>()
    .get('/auth/providers', (c) => c.json({ providers: listEnabledProviders() }))
    .get('/providers', requireSuperadmin, (c) => c.json({ providers: listProvidersForAdmin(publicOrigin(c)) }))
    .put('/providers/:type', requireSuperadmin, validate('json', providerBody), async (c) => {
        const type = c.req.param('type');
        if (!isProviderType(type)) return c.json({ error: 'not_found' }, 404);
        const saved = await saveProvider(type, c.req.valid('json'), publicOrigin(c));
        if ('error' in saved) return c.json({ error: saved.error }, 400);
        return c.json({ provider: toPublicProvider(type, publicOrigin(c), saved) });
    })
    .post('/providers/:type/test', requireSuperadmin, async (c) => {
        const type = c.req.param('type');
        if (!isProviderType(type)) return c.json({ error: 'not_found' }, 404);
        const tested = await testProvider(type, publicOrigin(c));
        if (!tested) return c.json({ error: 'not_found' }, 404);
        return c.json({ provider: toPublicProvider(type, publicOrigin(c), tested) });
    })
    .delete('/providers/:type', requireSuperadmin, (c) => {
        const type = c.req.param('type');
        if (!isProviderType(type) || !getProvider(type)) return c.json({ error: 'not_found' }, 404);
        deleteProvider(type);
        return c.json({ provider: toPublicProvider(type, publicOrigin(c), null) });
    });
