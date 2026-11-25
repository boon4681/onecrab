import { error } from '@sveltejs/kit';
import { findAvailableShare } from '../../../backend/shares/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
    const share = findAvailableShare(params.id);
    if (!share) error(404, 'This file does not exist or has expired');
    return { id: share.id, size: share.size, expiresAt: share.expiresAt, ownerId: share.ownerId };
};
