import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { resolveExampleServerAddress } from '../../_shared/e2e/server.ts';

const exampleRoot = fileURLToPath(new URL('..', import.meta.url));
const devAddress = await resolveExampleServerAddress({
	baseURLEnv: 'STORYBOOK_DEV_BASE_URL',
	portEnv: 'STORYBOOK_DEV_PORT',
	persistAllocatedPort: true,
});
const staticAddress = await resolveExampleServerAddress({
	baseURLEnv: 'STORYBOOK_STATIC_BASE_URL',
	portEnv: 'STORYBOOK_STATIC_PORT',
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
		trace: 'retain-on-failure',
	},
	projects: [
		{ name: 'development', use: { baseURL: devAddress.baseURL } },
		{ name: 'static', use: { baseURL: staticAddress.baseURL } },
	],
	webServer: [
		...(devAddress.external
			? []
			: [
					{
						command: `pnpm dev --host ${devAddress.host} --port ${devAddress.port} --ci --no-version-updates`,
						url: devAddress.baseURL,
						cwd: exampleRoot,
						reuseExistingServer: false,
						timeout: 90_000,
					},
				]),
		...(staticAddress.external
			? []
			: [
					{
						command: `pnpm exec vite preview --outDir dist --host ${staticAddress.host} --port ${staticAddress.port} --strictPort`,
						url: staticAddress.baseURL,
						cwd: exampleRoot,
						reuseExistingServer: false,
						timeout: 90_000,
					},
				]),
	],
});
