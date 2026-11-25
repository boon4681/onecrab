import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { writeSessionCookie, type AppEnv } from '../auth/middleware';
import { createSession } from '../auth/session';
import { publicOrigin } from '../providers/routes';
import { callbackUrl, getProvider, isProviderType, recordTest } from '../providers/service';
import { finishFlow, startFlow, type FlowState } from './flows';
import { resolveIdentity, SIGN_IN_ERROR_MESSAGES, type SignInError } from './identity';

const FLOW_COOKIE = 'onecrab_oauth';

const toLogin = (c: Context, error: keyof typeof SIGN_IN_ERROR_MESSAGES) => c.redirect(`/login?error=${error}`);

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

// Runs inside the "Try sign-in" popup: report back to the settings page and close.
const testResult = (c: Context, ok: boolean, message: string) =>
    c.html(`<!doctype html><meta charset="utf-8"><title>Provider test</title>
<body style="font-family:system-ui;background:#0a0a0a;color:#eee;padding:2rem">
<p>${escapeHtml(message)}</p>
<script>
window.opener?.postMessage(${JSON.stringify({ source: 'onecrab-provider-test', ok, message })}, location.origin);
setTimeout(() => window.close(), 1200);
</script></body>`);

const readFlow = (c: Context): FlowState | null => {
    const raw = getCookie(c, FLOW_COOKIE);
    if (!raw) return null;
    try {
        return JSON.parse(Buffer.from(raw, 'base64url').toString()) as FlowState;
    } catch {
        return null;
    }
};

export const signinRoutes = new Hono<AppEnv>()
    .get('/auth/signin/:type', async (c) => {
        const type = c.req.param('type');
        const test = c.req.query('test') === '1';
        if (!isProviderType(type)) return toLogin(c, 'provider_unavailable');
        const provider = getProvider(type);
        const allowed = test ? c.get('user')?.role === 'superadmin' && !!provider : !!provider?.enabled;
        if (!provider || !allowed) return toLogin(c, 'provider_unavailable');

        let started;
        try {
            started = await startFlow(provider, callbackUrl(publicOrigin(c), type), test);
        } catch {
            return test ? testResult(c, false, 'Could not reach the provider.') : toLogin(c, 'failed');
        }
        setCookie(c, FLOW_COOKIE, Buffer.from(JSON.stringify(started.flow)).toString('base64url'), {
            httpOnly: true,
            secure: new URL(c.req.url).protocol === 'https:',
            sameSite: 'Lax',
            path: '/api/auth',
            maxAge: 600
        });
        return c.redirect(started.url);
    })
    .get('/auth/callback/:type', async (c) => {
        const type = c.req.param('type');
        const flow = readFlow(c);
        deleteCookie(c, FLOW_COOKIE, { path: '/api/auth' });
        if (!isProviderType(type) || !flow || flow.type !== type) {
            // Usually the callback landed on a different host than sign-in started on, so the flow cookie wasn't sent.
            console.warn(
                `[onecrab] ${type} sign-in failed: no sign-in cookie on callback. Callback reached ${new URL(c.req.url).origin}; check ORIGIN matches the URL you browse.`
            );
            return toLogin(c, 'failed');
        }

        const provider = getProvider(type);
        if (!provider || (!flow.test && !provider.enabled)) {
            console.warn(`[onecrab] ${type} sign-in failed: provider is not configured or not enabled`);
            return toLogin(c, 'provider_unavailable');
        }

        const redirectUri = callbackUrl(publicOrigin(c), type);
        // Rebuild on the public origin so the token request's redirect_uri matches the registered one.
        const current = new URL(redirectUri);
        current.search = new URL(c.req.url).search;

        if (current.searchParams.get('error')) {
            const reason = current.searchParams.get('error_description') ?? current.searchParams.get('error')!;
            console.warn(`[onecrab] ${type} sign-in failed: provider returned "${reason}"`);
            return flow.test ? testResult(c, false, `Provider returned: ${reason}`) : toLogin(c, 'failed');
        }

        let identity;
        try {
            identity = await finishFlow(provider, current, flow, redirectUri);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'unknown error';
            console.warn(`[onecrab] ${type} sign-in failed: ${message}`);
            return flow.test ? testResult(c, false, `Sign-in failed: ${message}`) : toLogin(c, 'failed');
        }

        if (flow.test) {
            const ok = !!identity.email && identity.emailVerified;
            const message = !identity.email
                ? 'Sign-in reached the provider, but it returned no email address.'
                : identity.emailVerified
                  ? `Sign-in works: got ${identity.email}.`
                  : `Sign-in works, but ${identity.email} is not marked verified, so users would be rejected. Turn on "Trust emails" if this provider only issues addresses it owns.`;
            // A real round trip is stronger proof than the fake-code probe, so it can enable the provider.
            recordTest(type, { ok, message });
            return testResult(c, ok, message);
        }

        const result = resolveIdentity(identity);
        if ('error' in result) return toLogin(c, result.error satisfies SignInError);

        const session = createSession(result.user.id);
        writeSessionCookie(c, session.token, session.expiresAt);
        return c.redirect('/');
    });
