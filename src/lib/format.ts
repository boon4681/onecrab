export const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

export const tooManyAttemptsMessage = (retryAfterSeconds = 60) => {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
};

export const formatDate = (d: Date | string) =>
    new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000]
];

export const formatRelative = (d: Date | string, now = Date.now()) => {
    const diff = new Date(d).getTime() - now;
    for (const [unit, ms] of UNITS) {
        if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
    }
    return rtf.format(Math.round(diff / 1000), 'second');
};
