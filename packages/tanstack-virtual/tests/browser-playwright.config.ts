import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';

const packageRoot = resolve(import.meta.dirname, '..');
const mode = process.env.OCTANE_VIRTUAL_BROWSER_MODE ?? 'pristine';
if (!['pristine', 'adapted', 'baseline'].includes(mode)) throw new Error(`Unknown mode: ${mode}`);
const port = Number(
	process.env.OCTANE_VIRTUAL_BROWSER_PORT ?? (mode === 'pristine' ? '5373' : '5374'),
);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid browser port');
const repoRoot = resolve(packageRoot, '../..');
const quoteShell = (value: string) => "'" + value.replaceAll("'", "'\\'" + "'") + "'";
const vite = quoteShell(resolve(repoRoot, 'node_modules/vite/bin/vite.js'));
const config = quoteShell(resolve(packageRoot, 'tests/browser-vite.config.ts'));

export default defineConfig({
	testDir: packageRoot,
	testMatch:
		mode === 'pristine'
			? ['upstream/e2e/app/test/*.spec.ts']
			: ['tests/upstream/browser/test/*.spec.ts', 'tests/browser-contracts/*.spec.ts'],
	timeout: 30_000,
	expect: { timeout: 5_000 },
	workers: 1,
	retries: 0,
	forbidOnly: true,
	outputDir: resolve(packageRoot, '.browser-results', mode),
	use: { browserName: 'chromium', baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
	webServer: {
		command: `node ${vite} build --config ${config} && node ${vite} preview --config ${config} --host 127.0.0.1 --port ${port} --strictPort`,
		cwd: repoRoot,
		url: `http://127.0.0.1:${port}/scroll/`,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
