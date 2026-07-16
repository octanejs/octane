import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import { react } from '@octanejs/react-compat/vite';

export default defineConfig({
	// The complete React-compatibility setup: `react`/`react-dom` imports —
	// from node_modules packages and from this app's own `.tsx` islands —
	// resolve to the Octane facades. `tsx: false` leaves `.tsx` to the standard
	// automatic JSX transform so islands are authored as plain React code.
	plugins: [octane({ tsx: false, compat: [react()] })],
	esbuild: {
		jsx: 'automatic',
	},
	build: {
		target: 'esnext',
	},
});
