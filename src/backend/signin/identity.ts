import { and, eq } from 'drizzle-orm';
import { getDb } from '#backend/db/index.js';
import { accounts, invites, users, type ProviderType, type User } from '#backend/db/schema.js';

export type Identity = {
    provider: ProviderType;
    providerUserId: string;
    email: string | undefined;
    emailVerified: boolean;
};

export type SignInError = 'email_unverified' | 'not_invited' | 'admin_password_only';

export const resolveIdentity = (identity: Identity): { user: User } | { error: SignInError } => {
    const db = getDb();

    return db.transaction((tx) => {
        const linked = tx
            .select({ user: users })
            .from(accounts)
            .innerJoin(users, eq(accounts.userId, users.id))
            .where(and(eq(accounts.provider, identity.provider), eq(accounts.providerUserId, identity.providerUserId)))
            .get();
        if (linked) {
            // Removal deletes the invite, so a linked account alone must not keep someone signed in.
            if (linked.user.role === 'user' && !tx.select().from(invites).where(eq(invites.email, linked.user.email)).get()) {
                return { error: 'not_invited' as const };
            }
            return { user: linked.user };
        }

        if (!identity.email || !identity.emailVerified) return { error: 'email_unverified' as const };
        const email = identity.email.trim().toLowerCase();

        const existing = tx.select().from(users).where(eq(users.email, email)).get();
        if (existing?.role === 'superadmin') return { error: 'admin_password_only' as const };
        if (!tx.select().from(invites).where(eq(invites.email, email)).get()) return { error: 'not_invited' as const };

        const user = existing ?? tx.insert(users).values({ email, role: 'user' }).returning().get();
        tx.insert(accounts)
            .values({ provider: identity.provider, providerUserId: identity.providerUserId, userId: user.id })
            .run();
        return { user };
    });
};

export const SIGN_IN_ERROR_MESSAGES: Record<SignInError | 'provider_unavailable' | 'failed', string> = {
    email_unverified: 'Your account has no verified email address with that provider.',
    not_invited: 'That email has not been invited to onecrab.',
    admin_password_only: 'The superadmin signs in with email and password.',
    provider_unavailable: 'That sign-in method is not available.',
    failed: 'Sign-in failed. Please try again.'
};
