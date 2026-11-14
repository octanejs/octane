import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.LOTTIE_REACT_PRISTINE_ROOT ?? resolve(packageRoot, 'upstream');

export default defineConfig({
	root: packageRoot,
	test: {
		name: 'lottie-react-pristine-suite',
		include: [resolve(upstreamRoot, 'src/__tests__/*.test.tsx')],
		environment: 'jsdom',
		globals: true,
		setupFiles: ['tests/_canvas-setup.ts'],
	},
	plugins: [
		{
			name: 'lottie-react-pristine-jest-compat',
			enforce: 'pre',
			transform(code, id) {
				if (!id.startsWith(`${upstreamRoot}/`) || !id.endsWith('.test.tsx')) return;
				// Keep the upstream assertions and registrations, using Vitest's hoisted mocks.
				return code
					.replaceAll('jest.', 'vi.')
					.replaceAll('toBeCalled', 'toHaveBeenCalled')
					.replaceAll('window = Object.assign(window,', 'Object.assign(window,');
			},
		},
	],
	resolve: {
		dedupe: ['vitest', 'react', 'react-dom'],
		alias: [{ find: /^@testing-library\/react-hooks$/, replacement: '@testing-library/react' }],
	},
	oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
});
