// ORIGIN wins. Without it, trust the dev/reverse proxy's forwarded host so OAuth callbacks
// return to the address the browser is on (cookies are per host).
export const resolveOrigin = (request: Request) => {
    const configured = process.env.ORIGIN?.replace(/\/+$/, '');
    if (configured && URL.canParse(configured)) return configured;
    const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim();
    if (host) {
        const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || 'https';
        return `${proto}://${host}`;
    }
    return new URL(request.url).origin;
};
