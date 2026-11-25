import { timingSafeEqual } from 'node:crypto';
import { createId } from '@paralleldrive/cuid2';
import { eq } from 'drizzle-orm';
import { getDb } from '#backend/db/index.js';
import { sessions, setupLinks, users } from '#backend/db/schema.js';
import { hashPassword } from '../lib/password';

export type LinkPurpose = 'setup' | 'reset';

let superadminExists: boolean | undefined;

export const hasSuperadmin = () => {
    if (superadminExists) return true;
    superadminExists = !!getDb().select({ id: users.id }).from(users).where(eq(users.role, 'superadmin')).get();
    return superadminExists;
};

const linkPath = (a: string, b: string) => `/setup/${a}/${b}`;

export const ensureSetupLink = () => {
    if (hasSuperadmin()) return null;
    const db = getDb();
    let link = db.select().from(setupLinks).where(eq(setupLinks.purpose, 'setup')).get();
    if (!link) {
        link = db.insert(setupLinks).values({ purpose: 'setup', a: createId(), b: createId() }).returning().get();
    }
    return linkPath(link.a, link.b);
};

export const createResetLink = () => {
    if (!hasSuperadmin()) return null;
    const link = getDb()
        .insert(setupLinks)
        .values({ purpose: 'reset', a: createId(), b: createId() })
        .onConflictDoUpdate({ target: setupLinks.purpose, set: { a: createId(), b: createId(), createdAt: new Date() } })
        .returning()
        .get();
    return linkPath(link.a, link.b);
};

const safeEqual = (x: string, y: string) => {
    const bx = Buffer.from(x);
    const by = Buffer.from(y);
    return bx.length === by.length && timingSafeEqual(bx, by);
};

export const resolveLink = (a: string, b: string): LinkPurpose | null => {
    const purpose: LinkPurpose = hasSuperadmin() ? 'reset' : 'setup';
    const link = getDb().select().from(setupLinks).where(eq(setupLinks.purpose, purpose)).get();
    if (!link) return null;
    // Evaluate both halves so timing doesn't reveal which one matched.
    const okA = safeEqual(link.a, a);
    const okB = safeEqual(link.b, b);
    return okA && okB ? purpose : null;
};

export const completeSetup = async (a: string, b: string, email: string, password: string) => {
    if (resolveLink(a, b) !== 'setup') return null;
    const passwordHash = await hashPassword(password);
    const db = getDb();
    const user = db.transaction((tx) => {
        if (tx.select({ id: users.id }).from(users).where(eq(users.role, 'superadmin')).get()) return null;
        const created = tx.insert(users).values({ email, role: 'superadmin', passwordHash }).returning().get();
        tx.delete(setupLinks).run();
        return created;
    });
    if (user) superadminExists = true;
    return user;
};

export const completeReset = async (a: string, b: string, password: string) => {
    if (resolveLink(a, b) !== 'reset') return null;
    const passwordHash = await hashPassword(password);
    return getDb().transaction((tx) => {
        const stillValid = tx.select().from(setupLinks).where(eq(setupLinks.purpose, 'reset')).get();
        const admin = tx.select().from(users).where(eq(users.role, 'superadmin')).get();
        if (!stillValid || stillValid.a !== a || !admin) return null;
        tx.update(users).set({ passwordHash }).where(eq(users.id, admin.id)).run();
        tx.delete(sessions).where(eq(sessions.userId, admin.id)).run();
        tx.delete(setupLinks).where(eq(setupLinks.purpose, 'reset')).run();
        return admin;
    });
};

export const resetSuperadminCacheForTests = () => {
    superadminExists = undefined;
};
