// Octane flavor of the tanstack-com benchmark. Mirrors the react flavor's
// bench config (see ../react/vite.config.ts) on @octanejs/tanstack-start:
// nitro emits the production .output node server, tailwind matches the
// upstream styling pipeline. Content determinism knobs (TANSTACK_DOCS_LOCAL,
// BENCH_PARTNER_SEED) are honored by the shared server utils this app ports.
import { defineConfig } from 'vite';
import contentCollections from '@content-collections/vite';
import { nitro } from 'nitro/vite';
import { tanstackStart } from '@octanejs/tanstack-start/plugin/vite';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
	server: { port: Number(process.env.PORT) || 3000 },
	resolve: {
		alias: [{ find: '~', replacement: path.resolve(__dirname, './src') }],
	},
	plugins: [contentCollections(), tanstackStart(), nitro(), tailwindcss()],
});
