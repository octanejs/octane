// Mixed-toolchain build: Octane owns every project .tsrx by extension (the
// islands), and would own a .tsx only if it opened with a leading
// /** @jsxImportSource octane */ pragma; everything else — the React 19
// shell — passes through untouched to @vitejs/plugin-react. This is the
// documented requireDirective ownership split for React-hosted apps.
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { octane } from 'octane/compiler/vite';

// The e2e server runs a SOURCE-DRIVEN dev session under NODE_ENV=production
// (the documented example-server contract). plugin-react's config hook forces
// `oxc.jsx.refresh` on for EVERY serve session while its refresh PREAMBLE is
// skipped when isProduction — modules then call `$RefreshSig$` that nothing
// defined. Merge AFTER react() so this wins, disabling the oxc side exactly
// when plugin-react disables its own.
const alignOxcRefreshWithPreamble: Plugin = {
	name: 'harbor:align-oxc-refresh',
	config() {
		if (process.env.NODE_ENV === 'production') {
			return { oxc: { jsx: { refresh: false } } };
		}
	},
};

export default defineConfig({
	root: fileURLToPath(new URL('.', import.meta.url)),
	plugins: [octane({ requireDirective: true }), react(), alignOxcRefreshWithPreamble],
	// octane's workspace package resolves to raw TypeScript source; keep it out
	// of the dependency optimizer (never exclude react/react-dom — one instance).
	optimizeDeps: { exclude: ['octane'] },
	build: { target: 'esnext', outDir: 'dist/client' },
});
