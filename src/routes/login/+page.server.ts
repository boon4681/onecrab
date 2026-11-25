import { listEnabledProviders } from '../../backend/providers/service';
import { SIGN_IN_ERROR_MESSAGES } from '../../backend/signin/identity';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
    const code = url.searchParams.get('error');
    const error = code && code in SIGN_IN_ERROR_MESSAGES ? SIGN_IN_ERROR_MESSAGES[code as keyof typeof SIGN_IN_ERROR_MESSAGES] : '';
    return { providers: listEnabledProviders(), error };
};
