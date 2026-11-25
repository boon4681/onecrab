import { afterEach, describe, expect, it } from 'vitest';
import { resolveOrigin } from './origin';

const req = (headers: Record<string, string> = {}) => new Request('http://127.0.0.1:4937/api/x', { headers });

describe('resolveOrigin', () => {
    afterEach(() => {
        delete process.env.ORIGIN;
    });

    it('prefers ORIGIN without a trailing slash', () => {
        process.env.ORIGIN = 'https://files.example.com/';
        expect(resolveOrigin(req({ 'x-forwarded-host': 'other' }))).toBe('https://files.example.com');
    });

    it('uses forwarded host and proto from a proxy', () => {
        expect(resolveOrigin(req({ 'x-forwarded-host': 'onecrab.localhost', 'x-forwarded-proto': 'https' }))).toBe(
            'https://onecrab.localhost'
        );
    });

    it('ignores an ORIGIN that is not a URL', () => {
        process.env.ORIGIN = 'undefined';
        expect(resolveOrigin(req())).toBe('http://127.0.0.1:4937');
    });

    it('falls back to the request origin', () => {
        expect(resolveOrigin(req())).toBe('http://127.0.0.1:4937');
    });
});
