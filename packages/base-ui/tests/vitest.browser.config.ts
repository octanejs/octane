import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import base from './vitest.config.ts';

export default defineConfig({
	...base,
	optimizeDeps: {
		exclude: ['@mui/internal-test-utils', '@octanejs/testing-library', '@testing-library/react'],
		include: [
			'@mui/internal-test-utils > @testing-library/dom',
			'@mui/internal-test-utils > format-util',
			'@mui/internal-test-utils > chai-dom',
			'@mui/internal-test-utils > prop-types',
			'react',
			'octane > devalue',
			'@octanejs/base-ui-utils > reselect',
			'@octanejs/floating-ui > tabbable',
		],
	},
	define: { 'process.env.NODE_ENV': JSON.stringify('test') },
	test: {
		...base.test,
		name: 'base-ui-adapted-browser',
		// Native keyboard and pointer commands need stable focus across each file.
		// Match the parity harness when these suites run from the workspace too.
		fileParallelism: false,
		onStackTrace() {
			return true;
		},
		browser: {
			enabled: true,
			headless: true,
			screenshotFailures: false,
			provider: playwright({ contextOptions: { timezoneId: 'UTC' } }),
			instances: [{ browser: 'chromium' }],
		},
	},
	resolve: {
		...base.resolve,
		dedupe: ['vitest', '@vitest/runner', '@vitest/expect', '@vitest/snapshot'],
		alias: (base.resolve!.alias as Array<{ find: RegExp; replacement: string }>).map((alias) =>
			alias.find.source === '^vitest-browser-react$'
				? { ...alias, replacement: resolve(import.meta.dirname, 'support/browser-renderer.ts') }
				: alias,
		),
	},
});
