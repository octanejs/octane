import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { resolveExampleServerAddress } from '../../_shared/e2e/server.ts';

const exampleRoot = fileURLToPath(new URL('..', import.meta.url));
const productionPreview = process.env.OCTANE_EXAMPLE_PREVIEW === '1';
const address = await resolveExampleServerAddress({
	baseURLEnv: 'SIGNAL_CHAT_EXAMPLE_BASE_URL',
	portEnv: 'SIGNAL_CHAT_EXAMPLE_PORT',
	persistAllocatedPort: true,
});

export default defineConfig({
	testDir: '.',
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	timeout: 30_000,
	reporter: 'list',
	use: {
		...devices['Desktop Chrome'],
		baseURL: address.baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	webServer: address.external
		? undefined
		: {
				command: productionPreview
					? `HOST=${address.host} pnpm exec octane-preview --port ${address.port} --strictPort`
					: `pnpm exec vite --host ${address.host} --port ${address.port} --strictPort`,
				url: address.baseURL,
				cwd: exampleRoot,
				reuseExistingServer: false,
				timeout: 90_000,
			},
});
