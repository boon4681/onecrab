import type { User } from '#backend/db/schema.js';

declare global {
    namespace App {
        interface Locals {
            user: User | null;
        }
    }
}

export {};
