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
		hint: "compiles .tsrx, keeps the bundler's standard HTML handling",
		dependencies: [],
	},
	fullstack: {
		label: 'Routing and SSR',
		hint: 'adds octane.config.ts, streaming SSR, hydration, production build',
		dependencies: [],
	},
};

/**
 * Which package supplies the Octane plugin, per bundler and mode.
 *
 * `init` only scaffolds a Vite project, but it also advises projects that
 * already have a bundler config, and naming the Vite plugin at an Rspack
 * project would wire the wrong plugin into the wrong bundler.
 */
const INTEGRATIONS = {
	vite: {
		spa: { specifier: 'octane/compiler/vite', packages: [] },
		fullstack: { specifier: '@octanejs/vite-plugin', packages: ['@octanejs/vite-plugin'] },
	},
	rspack: {
		spa: { specifier: 'octane/compiler/bundler', packages: [] },
		fullstack: { specifier: '@octanejs/rspack-plugin', packages: ['@octanejs/rspack-plugin'] },
	},
	rsbuild: {
		spa: { specifier: 'octane/compiler/bundler', packages: [] },
		fullstack: { specifier: '@octanejs/rsbuild-plugin', packages: ['@octanejs/rsbuild-plugin'] },
	},
	rspeedy: {
		spa: { specifier: 'octane/compiler/bundler', packages: [] },
		fullstack: { specifier: '@octanejs/rspeedy-plugin', packages: ['@octanejs/rspeedy-plugin'] },
	},
};

/**
 * @param {keyof typeof INTEGRATIONS | null} bundler defaults to vite, which is
 *   what `init` scaffolds when a project has no bundler config yet
 * @param {keyof typeof MODES} mode
 * @returns {{ specifier: string, dependencies: string[], devDependencies: string[] }}
 */
export function integrationFor(bundler, mode) {
	const target = INTEGRATIONS[bundler ?? 'vite'] ?? INTEGRATIONS.vite;
	return {
		specifier: target[mode].specifier,
		dependencies: ['octane', ...target[mode].packages],
		// The bundler itself is only ours to install when we are the ones
		// creating its config.
		devDependencies: ['@tsrx/typescript-plugin', ...(bundler === null ? ['vite'] : [])],
	};
}

/**
 * @param {keyof typeof MODES} mode
 * @returns {string}
 */
export const viteConfig = (mode) => `import { defineConfig } from 'vite';
import { octane } from '${integrationFor('vite', mode).specifier}';

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

/**
 * Scripts that are correct whatever the bundler is. `tsrx-tsc` is the only
 * typechecker that reads `.tsrx`, regardless of how the project builds.
 */
export const SCRIPTS = {
	typecheck: 'tsrx-tsc --noEmit -p tsconfig.json',
};

/** Added only when init is the one creating the Vite config. */
export const VITE_SCRIPTS = {
	dev: 'vite',
	build: 'vite build',
};
