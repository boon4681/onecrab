import { eq } from 'drizzle-orm';
import { getDb } from '#backend/db/index.js';
import { PROVIDER_TYPES, providers, type Provider, type ProviderType } from '#backend/db/schema.js';
import { probeProvider, type ProbeResult } from './probe';

export const DEFAULT_NAMES: Record<ProviderType, string> = { google: 'Google', github: 'GitHub', oidc: 'OIDC' };

export const isProviderType = (s: string): s is ProviderType => (PROVIDER_TYPES as readonly string[]).includes(s);

export const callbackUrl = (origin: string, type: ProviderType) => `${origin}/api/auth/callback/${type}`;

const changeListeners = new Set<(type: ProviderType) => void>();

export const onProviderChange = (fn: (type: ProviderType) => void) => {
    changeListeners.add(fn);
    return () => changeListeners.delete(fn);
};

const notify = (type: ProviderType) => changeListeners.forEach((fn) => fn(type));

export const getProvider = (type: ProviderType) =>
    getDb().select().from(providers).where(eq(providers.type, type)).get() ?? null;

export const listEnabledProviders = () =>
    getDb()
        .select()
        .from(providers)
        .where(eq(providers.enabled, true))
        .all()
        .map((p) => ({ type: p.type, name: p.displayName || DEFAULT_NAMES[p.type] }));

export type ProviderInput = {
    clientId: string;
    clientSecret?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    userinfoUrl?: string;
    scopes?: string;
    usePkce?: boolean;
    displayName?: string;
    trustEmail?: boolean;
};

export const recordTest = (type: ProviderType, result: ProbeResult) =>
    getDb()
        .update(providers)
        .set({
            enabled: result.ok,
            lastTestOk: result.ok,
            lastTestMessage: result.message,
            lastTestedAt: new Date(),
            ...(result.authMethod ? { tokenAuthMethod: result.authMethod } : {})
        })
        .where(eq(providers.type, type))
        .returning()
        .get();

export const saveProvider = async (
    type: ProviderType,
    input: ProviderInput,
    origin: string,
    fetchFn?: typeof fetch
): Promise<Provider | { error: string }> => {
    const existing = getProvider(type);
    const clientSecret = input.clientSecret || existing?.clientSecret;
    if (!input.clientId) return { error: 'Client ID is required' };
    if (!clientSecret) return { error: 'Client secret is required' };
    const isOidc = type === 'oidc';
    if (isOidc && (!input.authorizationUrl || !input.tokenUrl || !input.userinfoUrl)) {
        return { error: 'Authorization URL, Token URL and User info URL are required' };
    }

    const values = {
        clientId: input.clientId,
        clientSecret,
        authorizationUrl: isOidc ? input.authorizationUrl! : null,
        tokenUrl: isOidc ? input.tokenUrl! : null,
        userinfoUrl: isOidc ? input.userinfoUrl! : null,
        scopes: isOidc ? input.scopes || null : null,
        usePkce: isOidc ? input.usePkce !== false : true,
        displayName: type === 'oidc' ? input.displayName || null : null,
        trustEmail: type === 'oidc' && !!input.trustEmail,
        // Any edit disables the provider until the new credentials pass a test.
        enabled: false,
        lastTestOk: null,
        lastTestMessage: null,
        lastTestedAt: null,
        updatedAt: new Date()
    };
    getDb()
        .insert(providers)
        .values({ type, ...values })
        .onConflictDoUpdate({ target: providers.type, set: values })
        .run();
    notify(type);

    return testProvider(type, origin, fetchFn) as Promise<Provider>;
};

export const testProvider = async (type: ProviderType, origin: string, fetchFn?: typeof fetch) => {
    const provider = getProvider(type);
    if (!provider) return null;
    const result = await probeProvider(provider, callbackUrl(origin, type), fetchFn);
    return recordTest(type, result);
};

export const deleteProvider = (type: ProviderType) => {
    getDb().delete(providers).where(eq(providers.type, type)).run();
    notify(type);
};

export const toPublicProvider = (type: ProviderType, origin: string, p: Provider | null) => ({
    type,
    defaultName: DEFAULT_NAMES[type],
    callbackUrl: callbackUrl(origin, type),
    configured: !!p,
    clientId: p?.clientId ?? '',
    hasSecret: !!p?.clientSecret,
    authorizationUrl: p?.authorizationUrl ?? '',
    tokenUrl: p?.tokenUrl ?? '',
    userinfoUrl: p?.userinfoUrl ?? '',
    scopes: p?.scopes ?? '',
    usePkce: p?.usePkce ?? true,
    displayName: p?.displayName ?? '',
    trustEmail: p?.trustEmail ?? false,
    enabled: p?.enabled ?? false,
    lastTestOk: p?.lastTestOk ?? null,
    lastTestMessage: p?.lastTestMessage ?? null,
    lastTestedAt: p?.lastTestedAt ?? null
});

export const listProvidersForAdmin = (origin: string) =>
    PROVIDER_TYPES.map((type) => toPublicProvider(type, origin, getProvider(type)));
