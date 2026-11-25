export type TokenAuthMethod = 'post' | 'basic';
export type ClientCredentials = { clientId: string; clientSecret: string };

const TIMEOUT_MS = 10_000;

export const tokenRequest = (
    fetchFn: typeof fetch,
    url: string,
    params: Record<string, string>,
    creds: ClientCredentials,
    method: TokenAuthMethod
) => {
    const body = new URLSearchParams(params);
    const headers: Record<string, string> = {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded'
    };
    if (method === 'basic') {
        const pair = `${encodeURIComponent(creds.clientId)}:${encodeURIComponent(creds.clientSecret)}`;
        headers.authorization = `Basic ${Buffer.from(pair).toString('base64')}`;
    } else {
        body.set('client_id', creds.clientId);
        body.set('client_secret', creds.clientSecret);
    }
    return fetchFn(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
};
