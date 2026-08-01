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
		// TypeScript is absent from this list on purpose, but it does get
		// installed: naming it here would take the newest major, which `tsrx-tsc`
		// cannot start under, so it is installed afterwards at the range
		// @tsrx/typescript-plugin declares as its peer. Nothing in the toolchain
		// carries a compiler of its own. The bundler is only ours to install when
		// we are the ones creating its config.
		devDependencies: [
			'@tsrx/typescript-plugin',
			'@tsrx/prettier-plugin',
			'prettier',
			...(bundler === null ? ['vite'] : []),
		],
	};
}

/**
 * @param {keyof typeof MODES} mode
 * @returns {string}
 */
export const viteConfig = (mode) => `import { defineConfig } from "vite";
import { octane } from "${integrationFor('vite', mode).specifier}";

export default defineConfig({
  plugins: [octane()],
  build: { target: "esnext" },
});
`;

/** One route, naming its export so a typo fails loudly instead of rendering the wrong component. */
export const octaneConfig = `import { defineConfig, RenderRoute } from "@octanejs/vite-plugin";

export default defineConfig({
  router: {
    routes: [new RenderRoute({ path: "/", entry: ["App", "/src/App.tsrx"] })],
  },
});
`;

/** The component both templates start from. */
export const appComponent = `export function App() @{
  <main>
    <h1>Hello from Octane</h1>
    <p>Edit src/App.tsrx and save.</p>
  </main>
}
`;

const SPA_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Octane app</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

const SSR_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Octane app</title>
    <!--ssr-head-->
  </head>
  <body>
    <div id="root"><!--ssr-body--></div>
  </body>
</html>
`;

/** The markers `validateSsrTemplate` requires of a fullstack index.html. */
export const SSR_MARKERS = ['<!--ssr-head-->', '<!--ssr-body-->'];

/**
 * The HTML shell.
 *
 * `spa` is an ordinary Vite page, so it loads the client entry itself.
 * `fullstack` loads nothing: the metaframework plugin owns the hydration entry,
 * injecting the virtual module in dev and the hashed script at build. Its
 * markers are a contract rather than decoration — `validateSsrTemplate` rejects
 * a template that does not carry exactly one of each.
 *
 * @param {keyof typeof MODES} mode
 * @returns {string}
 */
export const indexHtml = (mode) => (mode === 'fullstack' ? SSR_INDEX_HTML : SPA_INDEX_HTML);

/**
 * The client bootstrap, `spa` only. `render(App)` is the body-and-props
 * overload, which keeps the entry plain TypeScript with no JSX pragma to carry.
 */
export const clientEntry = `import { createRoot } from "octane";
import { App } from "./App.tsrx";

const root = createRoot(document.getElementById("root")!);
root.render(App);
`;

/**
 * Prettier cannot parse `.tsrx` on its own, so a project that formats without
 * this plugin either skips those files or mangles them.
 */
export const prettierConfig = `{
  "plugins": ["@tsrx/prettier-plugin"]
}
`;

/**
 * The config filenames Prettier itself looks for, in the order it looks. A
 * project that already has one owns its formatting, and this command states the
 * edit instead of picking a fight with it.
 *
 * The order is load-bearing, not decorative: the first of these that exists is
 * the one Prettier reads, so it is the one to inspect for the plugin and to
 * name in an instruction. Note how little of it is alphabetical. The module
 * variants interleave `.prettierrc.X` with `prettier.config.X` by type rather
 * than grouping by prefix, and `.toml` sorts last rather than with the other
 * data formats. Taken from prettier 3.9.6 and confirmed against it.
 *
 * `package.json` comes before all of these and is handled by its own check,
 * since the file existing says nothing about whether it configures Prettier.
 * `package.yaml`, which Prettier searches second, is not covered: telling one
 * that configures Prettier from one that does not needs a YAML parser this
 * package does not carry.
 */
export const PRETTIER_CONFIG_FILES = [
	'.prettierrc',
	'.prettierrc.json',
	'.prettierrc.yml',
	'.prettierrc.yaml',
	'.prettierrc.json5',
	'.prettierrc.js',
	'prettier.config.js',
	'.prettierrc.ts',
	'prettier.config.ts',
	'.prettierrc.mjs',
	'prettier.config.mjs',
	'.prettierrc.mts',
	'prettier.config.mts',
	'.prettierrc.cjs',
	'prettier.config.cjs',
	'.prettierrc.cts',
	'prettier.config.cts',
	'.prettierrc.toml',
];

export const tsconfig = `{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["esnext", "dom", "dom.iterable"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "jsxImportSource": "octane",
    "plugins": [
      {
        "name": "@tsrx/typescript-plugin"
      }
    ]
  },
  "include": ["src/**/*", "vite.config.ts"]
}
`;

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
