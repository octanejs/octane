import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { resolveExampleServerAddress } from '../../_shared/e2e/server.ts';

const exampleRoot = fileURLToPath(new URL('..', import.meta.url));
const address = await resolveExampleServerAddress({
	baseURLEnv: 'PAGECRAFT_EXAMPLE_BASE_URL',
	portEnv: 'PAGECRAFT_EXAMPLE_PORT',
	persistAllocatedPort: true,
});
const production = process.env.PAGECRAFT_DIST === '1';

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
				command: `PAGECRAFT_DIST=${production ? '1' : '0'} PORT=${address.port} HOST=${address.host} node server.mjs`,
				url: `${address.baseURL}/health`,
				cwd: exampleRoot,
				reuseExistingServer: false,
				timeout: 90_000,
			},
});
