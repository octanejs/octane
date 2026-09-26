import { octane } from '../../../packages/octane/src/compiler/vite.js';

process.env.OCTANE_COMPILE_FROZEN_AST ??= '1';
process.env.OCTANE_COMPILE_ASSERT_LOC ??= '1';

export default {
	plugins: [octane({ hmr: false })],
	test: {
		include: ['benchmarks/streamed-shell-prototype/nested-query-owner/observation.test.ts'],
		environment: 'jsdom',
		setupFiles: ['packages/octane/tests/_per-test-setup.ts'],
	},
};
