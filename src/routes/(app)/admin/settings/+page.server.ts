import { error } from '@sveltejs/kit';
import { listProvidersForAdmin } from '../../../../backend/providers/service';
import { resolveOrigin } from '#backend/lib/origin.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url, request }) => {
    if (locals.user?.role !== 'superadmin') error(404, 'Not found');
    return { providers: listProvidersForAdmin(resolveOrigin(request)), welcome: url.searchParams.has('welcome') };
};
