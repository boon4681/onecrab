import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const DEFAULT_DATA_DIR = './.onecrab';
export const DB_FILENAME = 'data.db';

export const dataDir = () => {
    const dir = resolve(process.env.DATA_DIR ?? DEFAULT_DATA_DIR);
    mkdirSync(dir, { recursive: true });
    return dir;
};

export const dbPath = () => join(dataDir(), DB_FILENAME);
