import { app } from '../../../backend/app';
import type { RequestHandler } from './$types';

const handler: RequestHandler = ({ request, getClientAddress }) => {
    let clientAddress: string | undefined;
    try {
        clientAddress = getClientAddress();
    } catch {
        clientAddress = undefined;
    }
    return app.fetch(request, { clientAddress });
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
