import { blob, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const users = sqliteTable('users', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    email: text('email').notNull().unique(),
    role: text('role', { enum: ['superadmin', 'user'] }).notNull(),
    passwordHash: text('password_hash'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .$defaultFn(() => new Date())
});

export const sessions = sqliteTable('sessions', {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
});

// Tokens are kept in plaintext: the link must be re-printed on every boot until used,
// and anyone able to read the DB before setup already owns the host.
export const setupLinks = sqliteTable('setup_links', {
    purpose: text('purpose', { enum: ['setup', 'reset'] }).primaryKey(),
    a: text('a').notNull(),
    b: text('b').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .$defaultFn(() => new Date())
});

export const shares = sqliteTable('shares', {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    size: integer('size').notNull(),
    salt: blob('salt', { mode: 'buffer' }).notNull(),
    fileIv: blob('file_iv', { mode: 'buffer' }).notNull(),
    sealedMeta: blob('sealed_meta', { mode: 'buffer' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    maxDownloads: integer('max_downloads'),
    downloads: integer('downloads').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .$defaultFn(() => new Date())
});

export const rateLimits = sqliteTable('rate_limits', {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
});

export const PROVIDER_TYPES = ['google', 'github', 'oidc'] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const providers = sqliteTable('providers', {
    type: text('type', { enum: PROVIDER_TYPES }).primaryKey(),
    clientId: text('client_id').notNull(),
    clientSecret: text('client_secret').notNull(),
    displayName: text('display_name'),
    authorizationUrl: text('authorization_url'),
    tokenUrl: text('token_url'),
    userinfoUrl: text('userinfo_url'),
    scopes: text('scopes'),
    usePkce: integer('use_pkce', { mode: 'boolean' }).notNull().default(true),
    tokenAuthMethod: text('token_auth_method', { enum: ['post', 'basic'] })
        .notNull()
        .default('post'),
    // For issuers that omit email_verified but only hand out addresses they own (e.g. a university IdP).
    trustEmail: integer('trust_email', { mode: 'boolean' }).notNull().default(false),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    lastTestOk: integer('last_test_ok', { mode: 'boolean' }),
    lastTestMessage: text('last_test_message'),
    lastTestedAt: integer('last_tested_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
        .notNull()
        .$defaultFn(() => new Date())
});

export const invites = sqliteTable('invites', {
    email: text('email').primaryKey(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .$defaultFn(() => new Date())
});

export const accounts = sqliteTable(
    'accounts',
    {
        provider: text('provider', { enum: PROVIDER_TYPES }).notNull(),
        providerUserId: text('provider_user_id').notNull(),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: integer('created_at', { mode: 'timestamp_ms' })
            .notNull()
            .$defaultFn(() => new Date())
    },
    (t) => [primaryKey({ columns: [t.provider, t.providerUserId] })]
);

export type User = typeof users.$inferSelect;
export type Share = typeof shares.$inferSelect;
export type Provider = typeof providers.$inferSelect;
