import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { reactCompiler } from '../../react-compiler.mjs';

export default defineConfig({
	plugins: [
		react(),
		reactCompiler({
			include: /\/benchmarks\/streamdown-hosted\/(?:react|octane|shared)\/.*\.[jt]sx?(?:$|\?)/,
		}),
	],
	build: {
		target: 'esnext',
		minify: 'terser',
		terserOptions: {
			compress: { passes: 2, toplevel: true },
			mangle: { toplevel: true },
		},
	},
	server: { port: 5301, strictPort: true },
});
