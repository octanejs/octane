/**
 * The two supported ways to compile Octane.
 *
 * `spa` wires the compiler plugin only, which is all a client-rendered app
 * needs. `fullstack` wires the metaframework plugin, which adds routing,
 * streaming SSR, hydration, and the production build.
 */
export const MODES = {
	spa: {
		label: 'Client-only app',
		hint: "compiles .tsrx, keeps Vite's standard HTML handling",
		specifier: 'octane/compiler/vite',
		dependencies: ['octane'],
	},
	fullstack: {
		label: 'Routing and SSR',
		hint: 'adds octane.config.ts, streaming SSR, hydration, production build',
		specifier: '@octanejs/vite-plugin',
		dependencies: ['octane', '@octanejs/vite-plugin'],
	},
};

export const DEV_DEPENDENCIES = ['@tsrx/typescript-plugin', 'vite'];

/**
 * @param {keyof typeof MODES} mode
 * @returns {string}
 */
export const viteConfig = (mode) => `import { defineConfig } from 'vite';
import { octane } from '${MODES[mode].specifier}';

export default defineConfig({
\tplugins: [octane()],
\tbuild: { target: 'esnext' },
});
`;

export const octaneConfig = `import { defineConfig, RenderRoute } from '@octanejs/vite-plugin';

export default defineConfig({
\trouter: {
\t\troutes: [new RenderRoute({ path: '/', entry: ['App', '/src/App.tsrx'] })],
\t},
});
`;

export const appComponent = `export function App() @{
\t<div class="app">
\t\t<h1>{'Hello from Octane' as string}</h1>
\t</div>
}
`;

export const tsconfig = {
	compilerOptions: {
		target: 'esnext',
		module: 'esnext',
		moduleResolution: 'bundler',
		lib: ['esnext', 'dom', 'dom.iterable'],
		strict: true,
		noEmit: true,
		allowImportingTsExtensions: true,
		isolatedModules: true,
		esModuleInterop: true,
		skipLibCheck: true,
		jsx: 'react-jsx',
		jsxImportSource: 'octane',
		plugins: [{ name: '@tsrx/typescript-plugin' }],
	},
	include: ['src/**/*', 'vite.config.ts'],
};

export const SCRIPTS = {
	dev: 'vite',
	build: 'vite build',
	typecheck: 'tsrx-tsc --noEmit -p tsconfig.json',
};
