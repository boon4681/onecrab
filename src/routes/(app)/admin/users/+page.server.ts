import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
    if (locals.user?.role !== 'superadmin') error(404, 'Not found');
};
