import { createCipheriv, createDecipheriv, randomBytes, randomInt } from 'node:crypto';
import { argon2id } from 'hash-wasm';
import { ARGON2_PARAMS } from '../lib/password';

// No 0/O, 1/I/L: Passcodes get read aloud and retyped.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const MIN_PASSCODE_LENGTH = 6;
export const MAX_PASSCODE_LENGTH = 64;

export const normalizePasscode = (passcode: string) => passcode.trim().toUpperCase();

export const isValidPasscode = (passcode: string) => {
    const p = normalizePasscode(passcode);
    return (
        p.length >= MIN_PASSCODE_LENGTH &&
        p.length <= MAX_PASSCODE_LENGTH &&
        /^[A-Z0-9]+$/.test(p) &&
        /[A-Z]/.test(p) &&
        /[0-9]/.test(p)
    );
};

export const generatePasscode = () => {
    for (;;) {
        let p = '';
        for (let i = 0; i < MIN_PASSCODE_LENGTH; i++) p += ALPHABET[randomInt(ALPHABET.length)];
        if (isValidPasscode(p)) return p;
    }
};

export const newSalt = () => randomBytes(16);

export const deriveFileKey = async (passcode: string, salt: Buffer) =>
    Buffer.from(
        await argon2id({ ...ARGON2_PARAMS, password: normalizePasscode(passcode), salt, outputType: 'binary' })
    );

export const encrypt = (key: Buffer, aad: string, plaintext: Buffer, iv = randomBytes(IV_BYTES)) => {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad));
    const data = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    return { iv, data };
};

export const decrypt = (key: Buffer, aad: string, iv: Buffer, data: Buffer) => {
    if (data.length < TAG_BYTES) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
    try {
        return Buffer.concat([decipher.update(data.subarray(0, data.length - TAG_BYTES)), decipher.final()]);
    } catch {
        return null;
    }
};

export type ShareMeta = { name: string; type: string };

export const sealMeta = (key: Buffer, shareId: string, meta: ShareMeta) => {
    const { iv, data } = encrypt(key, `meta:${shareId}`, Buffer.from(JSON.stringify(meta)));
    return Buffer.concat([iv, data]);
};

export const openMeta = (key: Buffer, shareId: string, sealed: Buffer): ShareMeta | null => {
    const plain = decrypt(key, `meta:${shareId}`, sealed.subarray(0, IV_BYTES), sealed.subarray(IV_BYTES));
    return plain ? (JSON.parse(plain.toString()) as ShareMeta) : null;
};

export const fileAad = (shareId: string) => `file:${shareId}`;
