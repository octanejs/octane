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

	// Boot three servers:
	//
	//  - :5191 / :5192 — plain `vite` (CLIENT-ONLY): the index.html entry hydrates
	//    only when the server pre-rendered (no #__octane_data here), so it falls
	//    back to createRoot(). The mocked nav/feed/pagination specs run here, where
	//    `page.route()` deterministically stubs the HN Firebase API client-side.
	//  - :5194 — the dev SSR server for the TSRX app (`node server.mjs tsrx`): each
	//    request is server-rendered with the route's data resolved (prefetched into
	//    the QueryClient) + dehydrated, then hydrated. ssr.spec.ts hits it to prove
	//    the rows arrive IN the server HTML. Its fetches happen in Node (Playwright
	//    can't stub them), so ssr.spec.ts uses LIVE data and asserts presence (≥1
	//    row), not exact stubbed counts. (The .tsx app's SSR is blocked upstream —
	//    see README "SSR & hydration" — so only the TSRX SSR server is booted and
	//    ssr.spec.ts runs for the tsrx project only.)
	//
	// `reuseExistingServer` lets a hand-started server be reused locally; CI boots
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
		{
			command: 'PORT=5194 node server.mjs tsrx',
			url: 'http://localhost:5194',
			cwd: exampleRoot,
			reuseExistingServer: !process.env.CI,
			timeout: 90_000,
		},
	],
});
