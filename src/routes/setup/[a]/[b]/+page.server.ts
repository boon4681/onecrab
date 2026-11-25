import { error } from '@sveltejs/kit';
import { resolveLink } from '../../../../backend/auth/setup';
import { MIN_PASSWORD_LENGTH } from '../../../../backend/lib/password';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
    const purpose = resolveLink(params.a, params.b);
    if (!purpose) error(404, 'Not found');
    return { purpose, minPasswordLength: MIN_PASSWORD_LENGTH };
};
