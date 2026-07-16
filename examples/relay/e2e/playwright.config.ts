import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { resolveExampleServerAddress } from '../../_shared/e2e/server.ts';

const exampleRoot = fileURLToPath(new URL('..', import.meta.url));
const address = await resolveExampleServerAddress({
	baseURLEnv: 'RELAY_E2E_BASE_URL',
	portEnv: 'RELAY_E2E_PORT',
	persistAllocatedPort: true,
});

export default defineConfig({
	testDir: '.',
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: 'list',
	use: {
		...devices['Desktop Chrome'],
		baseURL: address.baseURL,
		trace: 'retain-on-failure',
	},
	webServer: address.external
		? undefined
		: {
				command: `NODE_ENV=production RELAY_DIST=1 PORT=${address.port} HOST=${address.host} node server.mjs`,
				url: `${address.baseURL}/health`,
				cwd: exampleRoot,
				reuseExistingServer: false,
				timeout: 90_000,
			},
});
