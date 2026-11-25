import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requireUser, type AppEnv } from '../auth/middleware';
import { clearLimit, clientIp, recordFailure, retryAfterSeconds, tooManyAttempts, type Limit } from '../lib/rate-limit';
import { validate } from '../lib/validate';
import { downloadBody, listQuery, uploadForm } from './schemas';
import {
    claimDownload,
    countActiveShares,
    createShare,
    deleteShare,
    findAvailableShare,
    getShareOwner,
    listShares,
    MAX_ACTIVE_SHARES,
    MAX_FILE_BYTES,
    openShare
} from './service';
import { renderShareBanner } from './og';

// Multipart framing and the passcode field ride on top of the file bytes.
const MULTIPART_OVERHEAD = 64 * 1024;

const ipLimit = (shareId: string, ip: string): Limit => ({ key: `dl:${shareId}:${ip}`, max: 5, windowMs: 15 * 60_000 });
const shareLimit = (shareId: string): Limit => ({ key: `dl:${shareId}`, max: 100, windowMs: 24 * 60 * 60_000 });

const contentDisposition = (name: string) => {
    const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

export const shareRoutes = new Hono<AppEnv>()
    .post(
        '/shares',
        requireUser,
        bodyLimit({
            maxSize: MAX_FILE_BYTES + MULTIPART_OVERHEAD,
            onError: (c) => c.json({ error: 'File is larger than 5 MB' }, 413)
        }),
        validate('form', uploadForm),
        async (c) => {
            const { file, passcode, ttl, maxDownloads } = c.req.valid('form');
            if (file.size > MAX_FILE_BYTES) return c.json({ error: 'File is larger than 5 MB' }, 413);

            const user = c.get('user')!;
            if (countActiveShares(user.id) >= MAX_ACTIVE_SHARES) {
                return c.json({ error: `You already have ${MAX_ACTIVE_SHARES} active shares. Delete one to upload another.` }, 409);
            }

            const bytes = Buffer.from(await file.arrayBuffer());
            if (bytes.length > MAX_FILE_BYTES) return c.json({ error: 'File is larger than 5 MB' }, 413);

            const share = await createShare({
                ownerId: user.id,
                name: file.name || 'file',
                type: file.type || 'application/octet-stream',
                bytes,
                passcode,
                ttl,
                maxDownloads
            });
            return c.json(share, 201);
        }
    )
    .get('/shares', requireUser, validate('query', listQuery), (c) => {
        const user = c.get('user')!;
        const all = user.role === 'superadmin' && c.req.valid('query').all === '1';
        const rows = listShares(all ? undefined : user.id);
        return c.json({ shares: rows.map(({ ownerId, ...rest }) => (all ? { ...rest, ownerId } : rest)) });
    })
    .delete('/shares/:id', requireUser, (c) => {
        const user = c.get('user')!;
        const id = c.req.param('id');
        const ownerId = getShareOwner(id);
        if (!ownerId || (ownerId !== user.id && user.role !== 'superadmin')) return c.json({ error: 'not_found' }, 404);
        deleteShare(id);
        return c.json({ ok: true });
    })
    .get('/shares/:id', (c) => {
        const share = findAvailableShare(c.req.param('id'));
        if (!share) return c.json({ error: 'not_found' }, 404);
        return c.json({ id: share.id, size: share.size, expiresAt: share.expiresAt, ownerId: share.ownerId });
    })
    .get('/shares/:id/og.png', async (c) => {
        const share = findAvailableShare(c.req.param('id'));
        if (!share) return c.json({ error: 'not_found' }, 404);
        // Short-lived: the banner shows the download count.
        return c.body(new Uint8Array(await renderShareBanner(share)), 200, {
            'content-type': 'image/png',
            'cache-control': 'public, max-age=300'
        });
    })
    .post('/shares/:id/download', validate('json', downloadBody), async (c) => {
        const share = findAvailableShare(c.req.param('id'));
        if (!share) return c.json({ error: 'not_found' }, 404);

        const limits = [ipLimit(share.id, clientIp(c)), shareLimit(share.id)];
        const retryAfter = Math.max(...limits.map(retryAfterSeconds));
        if (retryAfter > 0) return tooManyAttempts(c, retryAfter);

        const { passcode } = c.req.valid('json');
        const opened = passcode ? await openShare(share, passcode) : null;
        if (!opened) {
            for (const limit of limits) recordFailure(limit);
            return c.json({ error: 'Wrong passcode' }, 403);
        }
        clearLimit(limits[0]);

        if (!claimDownload(share.id)) return c.json({ error: 'not_found' }, 404);

        return c.body(new Uint8Array(opened.data), 200, {
            'content-type': 'application/octet-stream',
            'content-disposition': contentDisposition(opened.meta.name),
            'x-content-type-options': 'nosniff',
            'cache-control': 'no-store'
        });
    });
