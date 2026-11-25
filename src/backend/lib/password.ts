import { randomBytes } from 'node:crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

export const ARGON2_PARAMS = { parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32 } as const;

export const hashPassword = (password: string) =>
    argon2id({ ...ARGON2_PARAMS, password, salt: randomBytes(16), outputType: 'encoded' });

export const verifyPassword = (password: string, hash: string) => argon2Verify({ password, hash });

export const MIN_PASSWORD_LENGTH = 12;
