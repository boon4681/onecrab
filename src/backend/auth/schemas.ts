import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../lib/password';

const password = z
    .string({ error: 'Password is required' })
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(1024, 'Password is too long');

export const setupBody = z.object({
    // The reset form posts an empty email; only first-time setup needs one.
    email: z
        .string()
        .trim()
        .toLowerCase()
        .optional()
        .transform((e) => e || undefined)
        .pipe(z.email('Invalid email').optional()),
    password
});

export const loginBody = z.object({
    email: z.string().trim().toLowerCase().default(''),
    password: z.string().max(1024).default('')
});
