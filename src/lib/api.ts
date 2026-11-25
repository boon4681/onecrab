export const postJson = async (url: string, body: unknown = {}) => {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    const retryAfter = typeof data.retryAfter === 'number' ? data.retryAfter : undefined;
    return {
        ok: res.ok,
        status: res.status,
        retryAfter,
        error: typeof data.error === 'string' ? data.error : 'Something went wrong'
    };
};
