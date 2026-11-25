import * as client from 'openid-client';
import type { Provider, ProviderType } from '#backend/db/schema.js';
import { tokenRequest } from '../lib/oauth';
import { onProviderChange } from '../providers/service';
import type { Identity } from './identity';

export type FlowState = { type: ProviderType; state: string; verifier: string; test: boolean };

let fetchImpl: typeof fetch = (...args) => fetch(...args);
export const setFetchForTests = (fn: typeof fetch) => {
    fetchImpl = fn;
    googleConfig = undefined;
};

const GOOGLE_ISSUER = new URL('https://accounts.google.com');
let googleConfig: Promise<client.Configuration> | undefined;
onProviderChange((type) => {
    if (type === 'google') googleConfig = undefined;
});

const getGoogleConfig = (p: Provider) => {
    if (!googleConfig) {
        googleConfig = client.discovery(GOOGLE_ISSUER, p.clientId, undefined, client.ClientSecretPost(p.clientSecret), {
            [client.customFetch]: ((url, init) => fetchImpl(url, init as RequestInit)) as client.CustomFetch
        });
        googleConfig.catch(() => (googleConfig = undefined));
    }
    return googleConfig;
};

const withParams = (base: string, params: Record<string, string>) => {
    const url = new URL(base);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
};

export const startFlow = async (p: Provider, redirectUri: string, test: boolean) => {
    const flow: FlowState = {
        type: p.type,
        state: client.randomState(),
        verifier: client.randomPKCECodeVerifier(),
        test
    };

    if (p.type === 'github') {
        const url = withParams('https://github.com/login/oauth/authorize', {
            client_id: p.clientId,
            redirect_uri: redirectUri,
            scope: 'read:user user:email',
            state: flow.state,
            allow_signup: 'false'
        });
        return { url, flow };
    }

    const params: Record<string, string> = {
        state: flow.state,
        redirect_uri: redirectUri,
        scope: (p.type === 'oidc' && p.scopes) || 'openid email profile'
    };
    if (usesPkce(p)) {
        params.code_challenge = await client.calculatePKCECodeChallenge(flow.verifier);
        params.code_challenge_method = 'S256';
    }

    if (p.type === 'google') {
        const url = client.buildAuthorizationUrl(await getGoogleConfig(p), { ...params, prompt: 'select_account' });
        return { url: url.toString(), flow };
    }

    const url = withParams(p.authorizationUrl!, { response_type: 'code', client_id: p.clientId, ...params });
    return { url, flow };
};

// GitHub's flow here never sends a challenge, and some OAuth2 servers fail on PKCE params they don't know.
const usesPkce = (p: Provider) => p.type === 'google' || (p.type === 'oidc' && p.usePkce);

const bodySnippet = (text: string) => {
    const flat = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return flat.length > 300 ? `${flat.slice(0, 300)}…` : flat;
};

const getJson = async <T>(url: string, token: string, accept = 'application/json') => {
    const res = await fetchImpl(url, {
        headers: { authorization: `Bearer ${token}`, accept, 'user-agent': 'onecrab' }
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`user info URL ${url} returned HTTP ${res.status}: ${bodySnippet(text)}`);
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error(`user info URL ${url} did not return JSON: ${bodySnippet(text)}`);
    }
};

const exchangeCode = async (p: Provider, tokenUrl: string, callbackUrl: URL, flow: FlowState, redirectUri: string) => {
    const code = callbackUrl.searchParams.get('code');
    if (!code) throw new Error('provider redirected back without a code');
    if (callbackUrl.searchParams.get('state') !== flow.state) throw new Error('state mismatch');
    const res = await tokenRequest(
        fetchImpl,
        tokenUrl,
        {
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            ...(usesPkce(p) ? { code_verifier: flow.verifier } : {})
        },
        p,
        p.tokenAuthMethod
    );
    const text = await res.text();
    let token: { access_token?: string; error?: string; error_description?: string } = {};
    try {
        token = JSON.parse(text);
    } catch {
        // Reported below with the raw body.
    }
    if (!token.access_token) {
        const reason = token.error ? `${token.error}${token.error_description ? `: ${token.error_description}` : ''}` : bodySnippet(text);
        throw new Error(`token URL returned HTTP ${res.status} without an access_token (${reason}); redirect_uri was ${redirectUri}`);
    }
    return token.access_token;
};

const githubIdentity = async (p: Provider, callbackUrl: URL, flow: FlowState, redirectUri: string): Promise<Identity> => {
    const token = await exchangeCode(p, 'https://github.com/login/oauth/access_token', callbackUrl, flow, redirectUri);
    const accept = 'application/vnd.github+json';
    const user = await getJson<{ id: number }>('https://api.github.com/user', token, accept);
    const emails = await getJson<{ email: string; primary: boolean; verified: boolean }[]>(
        'https://api.github.com/user/emails',
        token,
        accept
    );
    const primary = emails.find((e) => e.primary);
    return { provider: 'github', providerUserId: String(user.id), email: primary?.email, emailVerified: !!primary?.verified };
};

const googleIdentity = async (p: Provider, callbackUrl: URL, flow: FlowState): Promise<Identity> => {
    const tokens = await client.authorizationCodeGrant(await getGoogleConfig(p), callbackUrl, {
        pkceCodeVerifier: flow.verifier,
        expectedState: flow.state,
        idTokenExpected: true
    });
    const claims = tokens.claims()!;
    return {
        provider: 'google',
        providerUserId: claims.sub,
        email: claims.email as string | undefined,
        emailVerified: claims.email_verified === true
    };
};

type UserInfo = { sub?: unknown; id?: unknown; user_id?: unknown; email?: unknown; email_verified?: unknown };

const oauthIdentity = async (p: Provider, callbackUrl: URL, flow: FlowState, redirectUri: string): Promise<Identity> => {
    const token = await exchangeCode(p, p.tokenUrl!, callbackUrl, flow, redirectUri);
    const info = await getJson<UserInfo>(p.userinfoUrl!, token);
    // Plain OAuth2 user endpoints name the id differently; OIDC userinfo always has sub.
    const id = info.sub ?? info.id ?? info.user_id;
    if (id === undefined || id === null || id === '') throw new Error('user info has no sub or id');
    return {
        provider: 'oidc',
        providerUserId: String(id),
        email: typeof info.email === 'string' ? info.email : undefined,
        emailVerified: info.email_verified === true || info.email_verified === 'true' || p.trustEmail
    };
};

export const finishFlow = (p: Provider, callbackUrl: URL, flow: FlowState, redirectUri: string) => {
    if (p.type === 'github') return githubIdentity(p, callbackUrl, flow, redirectUri);
    if (p.type === 'google') return googleIdentity(p, callbackUrl, flow);
    return oauthIdentity(p, callbackUrl, flow, redirectUri);
};
