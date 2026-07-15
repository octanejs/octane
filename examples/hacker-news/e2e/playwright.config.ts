import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// The example root (one level up from this e2e/ dir). The webServer commands use
// paths relative to it (`jsx/vite.config.ts`), and `vite` is resolved from the
// example's local node_modules — so pin each server's cwd here regardless of
// where Playwright is launched from.
const exampleRoot = fileURLToPath(new URL('..', import.meta.url));
const fixturePort = Number(process.env.HN_FIXTURE_PORT || 5190);
const fixtureBase = `http://127.0.0.1:${fixturePort}/v0`;
const clientMode = process.env.HN_E2E_CLIENT_MODE === 'dev' ? 'dev' : 'preview';

function clientCommand(app: 'jsx' | 'tsrx', port: number): string {
	if (clientMode === 'dev') {
		return `NODE_ENV=production VITE_HN_API_BASE=${fixtureBase} ./node_modules/.bin/vite --config ${app}/vite.config.ts --port ${port} --strictPort`;
	}
	return `./node_modules/.bin/vite preview --config ${app}/vite.config.ts --port ${port} --strictPort`;
}

// One Hacker News reader, built twice — the React-style `.tsx` app (port 5191)
// and the TSRX app (port 5192) — over a shared octane core. The SAME spec
// (nav.spec.ts) runs once per project; identical assertions passing under both
// IS the .tsx ≡ .tsrx parity proof.
//
// Standard `pnpm test:e2e` builds both clients with the fixture base baked in,
// then each project boots a Vite preview server for that production artifact.
// `pnpm test:e2e:dev` opts into source-serving Vite dev servers for faster local
// iteration while retaining production runtime semantics and strict diagnostics.
// The SSR middleware remains source-driven because this example has no
// production SSR bundle, but the E2E command runs its client/server runtime
// branches with NODE_ENV=production so release behavior is what the gate proves.
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

	// Boot the fixture API plus four app servers:
	//
	//  - :5190 — deterministic HN-compatible fixture API. VITE_HN_API_BASE points
	//    both Vite's browser graph and the Node SSR graph at it.
	//  - :5191 / :5192 — production client artifacts through `vite preview` by
	//    default (plain Vite dev servers only in explicit dev mode). The index.html
	//    entry falls back to createRoot() because these are client-only responses.
	//    The nav/feed/pagination specs run here.
	//  - :5193 (jsx) / :5194 (tsrx) — source-driven SSR servers (`node server.mjs
	//    <app>`) running production runtime semantics:
	//    each request is server-rendered with the route's data resolved (prefetched
	//    into the QueryClient) + dehydrated, then hydrated. ssr.spec.ts proves exact
	//    fixture rows arrive in the server HTML and hydrate cleanly. BOTH apps SSR,
	//    so the same assertions run once per project (SSR port = client port + 2).
	//
	// Never reuse hand-started servers: the suite owns their fixture environment.
	// `url` is polled until it responds, so a slow first compile is fine.
	webServer: [
		{
			command: `PORT=${fixturePort} node e2e/fixture-server.mjs`,
			url: `http://127.0.0.1:${fixturePort}/health`,
			cwd: exampleRoot,
			reuseExistingServer: false,
			timeout: 30_000,
		},
		{
			command: clientCommand('jsx', 5191),
			url: 'http://localhost:5191',
			cwd: exampleRoot,
			reuseExistingServer: false,
			timeout: 60_000,
		},
		{
			command: clientCommand('tsrx', 5192),
			url: 'http://localhost:5192',
			cwd: exampleRoot,
			reuseExistingServer: false,
			timeout: 60_000,
		},
		{
			command: `NODE_ENV=production VITE_HN_API_BASE=${fixtureBase} PORT=5193 node server.mjs jsx`,
			url: 'http://localhost:5193',
			cwd: exampleRoot,
			reuseExistingServer: false,
			timeout: 90_000,
		},
		{
			command: `NODE_ENV=production VITE_HN_API_BASE=${fixtureBase} PORT=5194 node server.mjs tsrx`,
			url: 'http://localhost:5194',
			cwd: exampleRoot,
			reuseExistingServer: false,
			timeout: 90_000,
		},
	],
});
