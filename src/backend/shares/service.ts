import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createId } from '@paralleldrive/cuid2';
import { and, count, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { getDb } from '#backend/db/index.js';
import { dataDir } from '#backend/lib/paths.js';
import { shares, type Share } from '#backend/db/schema.js';
import {
    decrypt,
    deriveFileKey,
    encrypt,
    fileAad,
    generatePasscode,
    newSalt,
    normalizePasscode,
    openMeta,
    sealMeta,
    type ShareMeta
} from './crypto';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ACTIVE_SHARES = 50;
export const MAX_DOWNLOADS_LIMIT = 1000;

const HOUR_MS = 60 * 60 * 1000;
export const TTLS = { '1h': HOUR_MS, '1d': 24 * HOUR_MS, '7d': 7 * 24 * HOUR_MS, '30d': 30 * 24 * HOUR_MS } as const;
export type Ttl = keyof typeof TTLS;
export const DEFAULT_TTL: Ttl = '7d';
export const isTtl = (v: string): v is Ttl => Object.hasOwn(TTLS, v);

export const filesDir = () => {
    const dir = join(dataDir(), 'files');
    mkdirSync(dir, { recursive: true });
    return dir;
};

const blobPath = (id: string) => join(filesDir(), id);

export const removeBlob = (id: string) => rmSync(blobPath(id), { force: true });

type NewShare = {
    ownerId: string;
    name: string;
    type: string;
    bytes: Buffer;
    passcode?: string;
    ttl?: Ttl;
    maxDownloads?: number;
};

export const createShare = async ({ ownerId, name, type, bytes, passcode, ttl = DEFAULT_TTL, maxDownloads }: NewShare) => {
    const id = createId();
    const code = passcode ? normalizePasscode(passcode) : generatePasscode();
    const salt = newSalt();
    const key = await deriveFileKey(code, salt);

    const { iv, data } = encrypt(key, fileAad(id), bytes);
    const path = blobPath(id);
    // Write-then-rename so a crash never leaves a half-written blob under a live id.
    writeFileSync(`${path}.tmp`, data);
    renameSync(`${path}.tmp`, path);

    try {
        getDb()
            .insert(shares)
            .values({
                id,
                ownerId,
                size: bytes.length,
                salt,
                fileIv: iv,
                sealedMeta: sealMeta(key, id, { name, type }),
                expiresAt: new Date(Date.now() + TTLS[ttl]),
                maxDownloads: maxDownloads ?? null
            })
            .run();
    } catch (err) {
        rmSync(path, { force: true });
        throw err;
    }

    return { id, passcode: code };
};

export const isAvailable = (share: Share) =>
    share.expiresAt.getTime() > Date.now() && (share.maxDownloads == null || share.downloads < share.maxDownloads);

export const findAvailableShare = (id: string) => {
    const share = getDb().select().from(shares).where(eq(shares.id, id)).get();
    return share && isAvailable(share) ? share : null;
};

const availableCondition = () =>
    and(gt(shares.expiresAt, new Date()), or(isNull(shares.maxDownloads), lt(shares.downloads, shares.maxDownloads)));

export const countActiveShares = (ownerId: string) =>
    getDb()
        .select({ n: count() })
        .from(shares)
        .where(and(eq(shares.ownerId, ownerId), availableCondition()))
        .get()!.n;

export const listShares = (ownerId?: string) =>
    getDb()
        .select({
            id: shares.id,
            ownerId: shares.ownerId,
            size: shares.size,
            createdAt: shares.createdAt,
            expiresAt: shares.expiresAt,
            downloads: shares.downloads,
            maxDownloads: shares.maxDownloads
        })
        .from(shares)
        .where(and(availableCondition(), ownerId ? eq(shares.ownerId, ownerId) : undefined))
        .orderBy(desc(shares.createdAt))
        .all();

export const deleteShare = (id: string) => {
    const removed = getDb().delete(shares).where(eq(shares.id, id)).run().changes > 0;
    removeBlob(id);
    return removed;
};

export const getShareOwner = (id: string) =>
    getDb().select({ ownerId: shares.ownerId }).from(shares).where(eq(shares.id, id)).get()?.ownerId ?? null;

// Atomic so concurrent downloads can never exceed maxDownloads.
export const claimDownload = (id: string) =>
    getDb()
        .update(shares)
        .set({ downloads: sql`${shares.downloads} + 1` })
        .where(and(eq(shares.id, id), availableCondition()))
        .run().changes > 0;

export const openShare = async (share: Share, passcode: string): Promise<{ meta: ShareMeta; data: Buffer } | null> => {
    const key = await deriveFileKey(passcode, share.salt);
    const meta = openMeta(key, share.id, share.sealedMeta);
    if (!meta) return null;
    const data = decrypt(key, fileAad(share.id), share.fileIv, readFileSync(blobPath(share.id)));
    return data ? { meta, data } : null;
};
