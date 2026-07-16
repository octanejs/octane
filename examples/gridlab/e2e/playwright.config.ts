import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { resolveExampleServerAddress } from '../../_shared/e2e/server.ts';

const exampleRoot = fileURLToPath(new URL('..', import.meta.url));
const productionPreview = process.env.OCTANE_EXAMPLE_PREVIEW === '1';
const address = await resolveExampleServerAddress({
	baseURLEnv: 'GRIDLAB_EXAMPLE_BASE_URL',
	portEnv: 'GRIDLAB_EXAMPLE_PORT',
	defaultPort: 5227,
	persistAllocatedPort: true,
});

export default defineConfig({
	testDir: '.',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: 'list',
	use: {
		...devices['Desktop Chrome'],
		baseURL: address.baseURL,
		permissions: ['clipboard-read', 'clipboard-write'],
		trace: 'retain-on-failure',
	},
	webServer: address.external
		? undefined
		: {
				command: productionPreview
					? `pnpm exec vite preview --host ${address.host} --port ${address.port} --strictPort`
					: `pnpm exec vite --host ${address.host} --port ${address.port} --strictPort`,
				url: address.baseURL,
				cwd: exampleRoot,
				reuseExistingServer: false,
				timeout: 60_000,
			},
});
