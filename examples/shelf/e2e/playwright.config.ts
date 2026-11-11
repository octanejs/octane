import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { resolveExampleServerAddress } from '../../_shared/e2e/server.ts';

const exampleRoot = fileURLToPath(new URL('..', import.meta.url));
const productionPreview = process.env.OCTANE_EXAMPLE_PREVIEW === '1';
// SHELF_BUNDLER=rspack runs the same journeys against the Rspack build's server.
const rspack = process.env.SHELF_BUNDLER === 'rspack';
const address = await resolveExampleServerAddress({
	baseURLEnv: 'SHELF_EXAMPLE_BASE_URL',
	portEnv: 'SHELF_EXAMPLE_PORT',
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
		trace: 'retain-on-failure',
	},
	webServer: address.external
		? undefined
		: {
				command: rspack
					? 'node dist-rspack/server/index.js'
					: productionPreview
						? `pnpm exec vite preview --host ${address.host} --port ${address.port} --strictPort`
						: `pnpm exec vite --host ${address.host} --port ${address.port} --strictPort`,
				env: { HOST: address.host, PORT: String(address.port) },
				url: address.baseURL,
				cwd: exampleRoot,
				reuseExistingServer: false,
				timeout: 60_000,
			},
});
