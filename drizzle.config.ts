import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: './src/backend/db/schema.ts',
    out: './drizzle',
    dialect: 'sqlite',
    dbCredentials: {
        url: `${process.env.DATA_DIR ?? './.onecrab'}/data.db`
    },
    verbose: true,
    strict: true
});
