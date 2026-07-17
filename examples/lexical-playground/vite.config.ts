import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	// The octane plugin compiles `.tsrx` everywhere EXCEPT @octanejs/lexical's own
	// `.ts` hooks — they forward hook slots manually, declared via
	// `"octane": { "hookSlots": { "manual": ["src"] } }` in the package's package.json, so the
	// plugin skips them automatically. The package's `.tsrx` components still
	// compile.
	plugins: [octane()],
	resolve: {
		// Resolve @octanejs/lexical's per-subpath `.tsrx`/`.ts` modules (mirrors the
		// vitest alias) so the workspace source is used directly.
		extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
	},
	build: { target: 'esnext' },
	server: { port: 5210, strictPort: true },
});
