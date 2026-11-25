import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';

export const variables = defineEnvVars({
    ORIGIN: {
        description: 'Public origin of the app, e.g. https://files.example.com. Used for OAuth callbacks and the setup link.',
        schema: z.url().optional()
    },
    DATA_DIR: {
        description: 'Directory holding data.db and files/. Defaults to ./.onecrab.',
        schema: z.string().optional()
    }
});
