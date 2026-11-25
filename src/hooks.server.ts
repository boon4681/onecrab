import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { getDb } from '#backend/db/index.js';
import { SESSION_COOKIE, validateSession } from './backend/auth/session';
import { ensureSetupLink, hasSuperadmin } from './backend/auth/setup';
import { startSweeper } from './backend/shares/sweep';
import { DATA_DIR, ORIGIN } from '$app/env/private';

// Vite dev keeps .env out of process.env, while the backend reads process.env in dev and prod alike.
// Assigning undefined to process.env would store the string "undefined".
if (ORIGIN && (!process.env.ORIGIN || process.env.ORIGIN === 'undefined')) process.env.ORIGIN = ORIGIN;
if (DATA_DIR && !process.env.DATA_DIR) process.env.DATA_DIR = DATA_DIR;

getDb();
startSweeper();

const setupPath = ensureSetupLink();
if (setupPath) {
    const origin = URL.canParse(process.env.ORIGIN ?? '') ? process.env.ORIGIN!.replace(/\/+$/, '') : '';
    console.log(`\n[onecrab] No superadmin yet. Finish setup at:\n  ${origin}${setupPath}\n`);
}

const isPublicPage = (path: string) => path === '/login' || path.startsWith('/f/') || path.startsWith('/setup/');

export const handle: Handle = async ({ event, resolve }) => {
    const path = event.url.pathname;
    if (path.startsWith('/api/')) return resolve(event);

    if (!hasSuperadmin()) {
        if (path.startsWith('/setup/') || path === '/setup-pending') return resolve(event);
        redirect(303, '/setup-pending');
    }
    if (path === '/setup-pending') redirect(303, '/');

    const token = event.cookies.get(SESSION_COOKIE);
    const session = validateSession(token);
    event.locals.user = session?.user ?? null;
    if (token && !session) event.cookies.delete(SESSION_COOKIE, { path: '/' });
    if (token && session?.refreshed) {
        event.cookies.set(SESSION_COOKIE, token, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: event.url.protocol === 'https:',
            expires: session.expiresAt
        });
    }

    if (path === '/login' && event.locals.user) redirect(303, '/');
    if (!isPublicPage(path) && !event.locals.user) redirect(303, '/login');

    return resolve(event);
};
