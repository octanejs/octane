import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	// React owns `.tsx` (via @vitejs/plugin-react); octane compiles only `.tsrx`.
	plugins: [octane({ tsx: false }), react()],
	optimizeDeps: {
		// Workspace packages ship raw TS — pre-bundling would snapshot stale output.
		exclude: ['octane', '@octanejs/react-wrapper'],
	},
	build: {
		target: 'esnext',
	},
});
