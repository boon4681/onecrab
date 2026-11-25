import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max).default('');

const url = (label: string) =>
    z
        .string()
        .trim()
        .max(2048)
        .default('')
        .refine((v) => v === '' || /^https?:\/\//.test(v), `${label} must be an http(s) URL`);

export const providerBody = z.object({
    clientId: text(512),
    clientSecret: text(1024),
    authorizationUrl: url('Authorization URL'),
    tokenUrl: url('Token URL'),
    userinfoUrl: url('User info URL'),
    scopes: text(512),
    usePkce: z.boolean().default(true),
    displayName: text(64),
    trustEmail: z.boolean().default(false)
});
