import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
// @ts-expect-error untyped harness helper shared with compare.mjs/run tooling
import { getFreePort } from '../serve-both.mjs';

// One spec, two projects: identical journeys must pass against BOTH flavors'
// production servers. OS-assigned loopback ports (allocated here, handed to
// the webServer commands) keep the suite collision-free beside other suites.
const root = fileURLToPath(new URL('..', import.meta.url));

const octanePort = Number(process.env.BENCH_OCTANE_PORT || (await getFreePort()));
const reactPort = Number(process.env.BENCH_REACT_PORT || (await getFreePort()));
process.env.BENCH_OCTANE_PORT = String(octanePort);
process.env.BENCH_REACT_PORT = String(reactPort);

export default defineConfig({
	testDir: '.',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: 'list',

	projects: [
		{
			name: 'octane',
			use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${octanePort}` },
		},
		{
			name: 'react',
			use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${reactPort}` },
		},
	],

	webServer: [
		{
			command: `NODE_ENV=production BENCH_DEFER_MS=60 PORT=${octanePort} node .output/server/index.mjs`,
			url: `http://127.0.0.1:${octanePort}`,
			cwd: `${root}octane`,
			reuseExistingServer: false,
			timeout: 60_000,
		},
		{
			command: `NODE_ENV=production BENCH_DEFER_MS=60 PORT=${reactPort} node serve.mjs`,
			url: `http://127.0.0.1:${reactPort}`,
			cwd: `${root}react`,
			reuseExistingServer: false,
			timeout: 60_000,
		},
	],
});
