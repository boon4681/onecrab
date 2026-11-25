import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { blobatar } from 'blobatar';
import { eq } from 'drizzle-orm';
import satori from 'satori';
import { html } from 'satori-html';
import { render } from 'svelte/server';
import { getDb } from '#backend/db/index.js';
import { users, type Share } from '#backend/db/schema.js';
import logoSvg from '#lib/assets/logo.svg?raw';
import { formatBytes } from '#lib/format.js';
import Banner from './og-banner.svelte';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const expiryDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const lockSvg = (color: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="16" r="1"/><rect x="3" y="10" width="18" height="12" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/></svg>`;

type Font = { name: string; data: Buffer; weight: 500 | 700 | 800; style: 'normal' };
let fonts: Font[] | undefined;

const fontFiles = (pkg: string, name: string, weights: Font['weight'][]): Font[] => {
    const dir = join(dirname(createRequire(import.meta.url).resolve(`@fontsource/${pkg}/LICENSE`)), 'files');
    return weights.map((weight) => ({
        name,
        data: readFileSync(join(dir, `${pkg}-latin-${weight}-normal.woff`)),
        weight,
        style: 'normal'
    }));
};

const loadFonts = () =>
    (fonts ??= [...fontFiles('figtree', 'Figtree', [700]), ...fontFiles('jetbrains-mono', 'JetBrains Mono', [500, 700, 800])]);

export const renderShareBanner = async (share: Share) => {
    const owner = getDb().select({ email: users.email }).from(users).where(eq(users.id, share.ownerId)).get();
    const { body } = render(Banner, {
        props: {
            logo: svgUri(logoSvg),
            lock: svgUri(lockSvg('#0a0a0a')),
            avatar: owner ? svgUri(blobatar(owner.email.toLowerCase(), { background: 'circle' })) : null,
            size: formatBytes(share.size),
            expires: expiryDate.format(share.expiresAt),
            downloads: share.maxDownloads == null ? 'No limit' : `${share.downloads} / ${share.maxDownloads}`
        }
    });
    const svg = await satori(html(body) as Parameters<typeof satori>[0], {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        fonts: loadFonts()
    });
    return new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
};
