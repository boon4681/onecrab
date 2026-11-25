import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vitest/config';

// The dev server opens the DB and migrates once; a new migration needs a fresh process to apply.
const restartOnMigration = (): Plugin => ({
    name: 'onecrab:restart-on-migration',
    apply: 'serve',
    configureServer(server) {
        server.watcher.add('drizzle/**/*.sql');
        server.watcher.on('add', (file) => {
            if (/[\\/]drizzle[\\/].*\.sql$/.test(file)) server.restart();
        });
    }
});

export default defineConfig({
    plugins: [
        restartOnMigration(),
        tailwindcss(),
        sveltekit({
            compilerOptions: {
                // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
                runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
            },
            adapter: adapter()
        })
    ],
    test: {
        include: ['src/**/*.test.ts'],
        setupFiles: ['src/test/setup.ts']
    }
});
