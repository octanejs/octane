import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { resolveExampleServerAddress } from '../../_shared/e2e/server.ts';

// One SSR server serves every journey: the suite owns its lifecycle and rides
// an OS-allocated loopback port (persisted into the env so the webServer
// command below sees the same number) — no fixed-port collisions with other
// example suites. SSR stays source-driven under NODE_ENV=production: that is
// the documented example-server contract this gate proves.
const exampleRoot = fileURLToPath(new URL('..', import.meta.url));
const address = await resolveExampleServerAddress({
	baseURLEnv: 'HARBOR_EXAMPLE_BASE_URL',
	portEnv: 'HARBOR_EXAMPLE_PORT',
	persistAllocatedPort: true,
});

export default defineConfig({
	testDir: '.',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: 'list',

	projects: [
		{
			name: 'harbor',
			use: {
				...devices['Desktop Chrome'],
				baseURL: address.baseURL,
			},
		},
	],

	webServer: address.external
		? undefined
		: [
				{
					command: `NODE_ENV=production PORT=${address.port} node server.mjs`,
					url: address.baseURL,
					cwd: exampleRoot,
					reuseExistingServer: false,
					timeout: 90_000,
				},
			],
});
