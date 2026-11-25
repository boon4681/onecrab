import { z } from 'zod';
import { isValidPasscode, MIN_PASSCODE_LENGTH } from './crypto';
import { DEFAULT_TTL, isTtl, MAX_DOWNLOADS_LIMIT } from './service';

export const uploadForm = z.object({
    file: z.instanceof(File, { error: 'No file' }).refine((f) => f.size > 0, 'File is empty'),
    passcode: z
        .string()
        .trim()
        .optional()
        .transform((p) => p || undefined)
        .refine(
            (p) => p === undefined || isValidPasscode(p),
            `Passcode needs at least ${MIN_PASSCODE_LENGTH} letters or digits, with at least one of each`
        ),
    ttl: z
        .string()
        .optional()
        .transform((t) => t || DEFAULT_TTL)
        .refine(isTtl, 'Expiry must be one of 1h, 1d, 7d, 30d'),
    maxDownloads: z
        .string()
        .trim()
        .optional()
        .transform((m) => (m ? Number(m) : undefined))
        .refine(
            (n) => n === undefined || (Number.isInteger(n) && n >= 1 && n <= MAX_DOWNLOADS_LIMIT),
            `Max downloads must be a whole number from 1 to ${MAX_DOWNLOADS_LIMIT}`
        )
});

export const downloadBody = z.object({ passcode: z.string().max(256).default('') });

export const listQuery = z.object({ all: z.literal('1').optional() });

