import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	// parallelUse: the compiler's parallel-`use()` pipeline (memoized creations,
	// batched unwrap, fetch-tree warming) — the feature this suite measures.
	// The fixture stays idiomatic nested use(); the compiler does the hoisting.
	plugins: [octane({ parallelUse: true })],
	optimizeDeps: {
		exclude: ['octane', 'octane/compiler'],
	},
	build: { target: 'esnext' },
	server: { port: 5216, strictPort: true },
});
