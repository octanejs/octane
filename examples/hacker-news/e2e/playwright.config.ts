import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// The example root (one level up from this e2e/ dir). The webServer commands use
// paths relative to it (`jsx/vite.config.ts`), and `vite` is resolved from the
// example's local node_modules — so pin each server's cwd here regardless of
// where Playwright is launched from.
const exampleRoot = fileURLToPath(new URL('..', import.meta.url));

// One Hacker News reader, built twice — the React-style `.tsx` app (port 5191)
// and the TSRX app (port 5192) — over a shared octane core. The SAME spec
// (nav.spec.ts) runs once per project; identical assertions passing under both
// IS the .tsx ≡ .tsrx parity proof.
//
// Each project boots its own Vite dev server (reused if one is already up
// locally). The HN Firebase API is fully stubbed inside the spec, so the run is
// deterministic and offline.
export default defineConfig({
	testDir: '.',
	// Run projects/files serially — the two dev servers are heavy and the spec is
	// short, so parallelism buys little and serial is the most reliable.
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: 'list',

	projects: [
		{
			name: 'jsx',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:5191',
			},
		},
		{
			name: 'tsrx',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:5192',
			},
		},
	],

	// Boot each app's dev server. `reuseExistingServer` lets a server you already
	// started by hand (e.g. `pnpm dev:jsx`) be reused locally; CI always boots
	// fresh. `url` is polled until it responds, so a slow first compile is fine.
	webServer: [
		{
			command: './node_modules/.bin/vite --config jsx/vite.config.ts --port 5191 --strictPort',
			url: 'http://localhost:5191',
			cwd: exampleRoot,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
		},
		{
			command: './node_modules/.bin/vite --config tsrx/vite.config.ts --port 5192 --strictPort',
			url: 'http://localhost:5192',
			cwd: exampleRoot,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
		},
	],
});
