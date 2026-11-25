import type { ProviderType } from '#backend/db/schema.js';
import { tokenRequest, type TokenAuthMethod } from '../lib/oauth';

export type ProbeConfig = { type: ProviderType; clientId: string; clientSecret: string; tokenUrl?: string | null };
export type ProbeResult = { ok: boolean; message: string; authMethod?: TokenAuthMethod };

type Fetch = typeof fetch;

const FAKE_CODE = 'onecrab-provider-test';

export const STATIC_TOKEN_ENDPOINTS: Record<Exclude<ProviderType, 'oidc'>, string> = {
    google: 'https://oauth2.googleapis.com/token',
    github: 'https://github.com/login/oauth/access_token'
};

// A token endpoint checks client credentials before the code, so "bad code" proves the credentials are good.
const CREDS_OK = new Set(['invalid_grant', 'bad_verification_code']);
const CREDS_BAD = new Set(['invalid_client', 'unauthorized_client', 'incorrect_client_credentials']);

export const mapTokenError = (error: string | undefined, description?: string): ProbeResult => {
    if (error && CREDS_OK.has(error)) return { ok: true, message: 'Credentials accepted' };
    if (error && CREDS_BAD.has(error)) return { ok: false, message: 'Client ID or secret was rejected' };
    if (error === 'redirect_uri_mismatch') {
        return { ok: false, message: 'Callback URL is not registered with the provider' };
    }
    return { ok: false, message: `Unexpected error "${error ?? ''}"${description ? `: ${description}` : ''}` };
};

const STATUS_HINTS: Record<number, string> = {
    400: 'The server rejected the request format.',
    401: 'The server refused the client credentials.',
    403: 'The server refused the client credentials.',
    404: 'Check the Token URL; nothing answers at that address.',
    405: 'The Token URL must accept POST requests.',
    415: 'The server does not accept form-encoded token requests.'
};

const snippet = (text: string) => {
    const flat = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
};

const networkError = (err: unknown) => {
    const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
    const detail = cause?.code ?? cause?.message ?? (err instanceof Error ? err.message : '');
    if (err instanceof Error && err.name === 'TimeoutError') return 'Timed out after 10 seconds';
    return detail ? `Could not reach the token endpoint (${detail})` : 'Could not reach the token endpoint';
};

type TokenErrorBody = { error?: unknown; error_description?: unknown; message?: unknown };

// Explains a response that isn't a standard OAuth error, so the admin can see what the server actually said.
const describeResponse = (res: Response, text: string, data: TokenErrorBody | null) => {
    const type = res.headers.get('content-type')?.split(';')[0] ?? 'no content type';
    const parts = [`Token URL answered HTTP ${res.status} (${type}).`];
    if (STATUS_HINTS[res.status]) parts.push(STATUS_HINTS[res.status]);
    if (res.ok && !data?.error) parts.push('It did not reject the fake test code, so this may not be an OAuth2 token endpoint.');
    const said = typeof data?.message === 'string' ? data.message : typeof data?.error === 'object' ? JSON.stringify(data.error) : text;
    if (said) parts.push(`Response: ${snippet(said)}`);
    if (res.status >= 500) {
        parts.push(
            'This server does not report OAuth errors for a bad code, so the credentials cannot be checked automatically. Use "Try sign-in" to verify with a real login.'
        );
    }
    return parts.join(' ');
};

const attempt = async (
    config: ProbeConfig,
    tokenUrl: string,
    callbackUrl: string,
    method: TokenAuthMethod,
    fetchFn: Fetch
): Promise<ProbeResult & { credsBad?: boolean }> => {
    let res: Response;
    try {
        res = await tokenRequest(
            fetchFn,
            tokenUrl,
            { grant_type: 'authorization_code', code: FAKE_CODE, redirect_uri: callbackUrl },
            config,
            method
        );
    } catch (err) {
        return { ok: false, message: networkError(err) };
    }
    const text = await res.text().catch(() => '');
    let data: TokenErrorBody | null = null;
    try {
        data = JSON.parse(text) as TokenErrorBody;
    } catch {
        // Non-JSON bodies (HTML error pages) are reported verbatim below.
    }
    const error = typeof data?.error === 'string' ? data.error : undefined;
    const description = typeof data?.error_description === 'string' ? data.error_description : undefined;
    if (!error) {
        const credsBad = res.status === 401;
        return { ok: false, message: describeResponse(res, text, data), credsBad };
    }
    return { ...mapTokenError(error, description), credsBad: CREDS_BAD.has(error) };
};

export const probeProvider = async (
    config: ProbeConfig,
    callbackUrl: string,
    fetchFn: Fetch = fetch
): Promise<ProbeResult> => {
    if (config.type !== 'oidc') {
        const { credsBad: _, ...result } = await attempt(
            config,
            STATIC_TOKEN_ENDPOINTS[config.type],
            callbackUrl,
            'post',
            fetchFn
        );
        return result;
    }

    if (!config.tokenUrl) return { ok: false, message: 'Token URL is required' };
    // Servers differ on where the secret goes; whichever style the server accepts is remembered for real sign-ins.
    const post = await attempt(config, config.tokenUrl, callbackUrl, 'post', fetchFn);
    if (post.ok) return { ok: true, message: post.message, authMethod: 'post' };
    if (!post.credsBad) return { ok: false, message: post.message };
    const basic = await attempt(config, config.tokenUrl, callbackUrl, 'basic', fetchFn);
    if (basic.ok) return { ok: true, message: basic.message, authMethod: 'basic' };
    if (basic.message === post.message) return { ok: false, message: basic.message };
    return { ok: false, message: `Secret in body: ${post.message} Basic auth: ${basic.message}` };
};
