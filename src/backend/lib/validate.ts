import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import { z } from 'zod';

// Every 400 has the same shape the UI already renders: { error: string }.
export const validate = <T extends z.ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
    zValidator(target, schema, (result, c) => {
        if (!result.success) return c.json({ error: result.error.issues[0]?.message ?? 'Invalid request' }, 400);
    });
