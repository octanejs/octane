import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { baseUIPristineConfig } from '../../../scripts/react-parity/base-ui-pristine-config.mjs';

const config = baseUIPristineConfig(resolve(import.meta.dirname, '..'), 'base-ui');
export default defineConfig({
	...config,
	// Keep Vite startup notices out of the harness's strict JSON evidence stream.
	logLevel: 'error',
	resolve: {
		...config.resolve,
		dedupe: ['vitest', '@vitest/runner', '@vitest/expect', '@vitest/snapshot'],
	},
	optimizeDeps: {
		rolldownOptions: { tsconfig: false },
		exclude: ['@mui/internal-test-utils'],
		include: [
			'react',
			'react/jsx-runtime',
			'react/jsx-dev-runtime',
			'react-dom',
			'@testing-library/react',
			'@testing-library/react/pure.js',
			'@testing-library/jest-dom/vitest',
			'@mui/internal-test-utils > @testing-library/dom',
			'@mui/internal-test-utils > format-util',
			'@mui/internal-test-utils > chai-dom',
			'@mui/internal-test-utils > prop-types',
		],
	},
	test: {
		...config.test,
		name: 'base-ui-pristine-browser',
		// Native keyboard and pointer commands need stable focus across each file.
		// Match the parity harness when these suites run from the workspace too.
		fileParallelism: false,
		browser: {
			enabled: true,
			provider: playwright({ contextOptions: { timezoneId: 'UTC' } }),
			headless: true,
			screenshotFailures: false,
			instances: [{ browser: 'chromium' }],
		},
	},
});
