import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	// The octane plugin compiles `.tsrx` everywhere EXCEPT @octanejs/lexical's own
	// `.ts` hooks (which forward hook slots manually — same exclude the vitest config
	// uses). The package's `.tsrx` components still compile.
	plugins: [octane({ exclude: ['/packages/lexical/src/'] })],
	optimizeDeps: { exclude: ['octane', 'octane/compiler', '@octanejs/lexical'] },
	resolve: {
		// Resolve @octanejs/lexical's per-subpath `.tsrx`/`.ts` modules (mirrors the
		// vitest alias) so the workspace source is used directly.
		extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
	},
	build: { target: 'esnext' },
	server: { port: 5210, strictPort: true },
});
