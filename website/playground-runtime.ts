import type { Plugin } from 'vite';
import { createRequire } from 'node:module';
import { build as esbuildBuild } from 'esbuild';
import type { RuntimeManifest } from './src/lib/playground-sandbox.ts';

// The playground executes user code in a sandboxed iframe with an OPAQUE
// origin (src/lib/playground-sandbox.ts). That iframe can't import the site's
// bundled octane (blob URLs are origin-bound and cross-origin module fetches
// need CORS), so the parent hands it the runtime as TEXT and the iframe turns
// it into blob modules on its own side of the boundary.
//
// The runtime ships as a JSON MANIFEST of esbuild code-split chunks rather
// than one file: `octane`, its compiler-only client ABI, and `octane/react`
// are separate entries sharing the core through common chunks. Bundling any
// entry standalone would duplicate the runtime's hook/context singletons. React
// itself stays EXTERNAL: the sandbox's import map resolves the react family to
// esm.sh, so react is only ever fetched when user code actually imports
// `octane/react` — pure-octane sessions never touch the network.
export async function buildPlaygroundRuntimeManifest(): Promise<RuntimeManifest> {
	const require = createRequire(import.meta.url);
	const out = await esbuildBuild({
		// Workspace link: website/node_modules/octane → packages/octane, whose
		// exports map points entries at raw TS sources — esbuild handles them.
		entryPoints: {
			octane: require.resolve('octane'),
			'octane-internal-client': require.resolve('octane/internal/client'),
			'octane-react': require.resolve('octane/react'),
		},
		bundle: true,
		splitting: true,
		format: 'esm',
		target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'],
		minify: true,
		write: false,
		outdir: 'playground-runtime',
		entryNames: '[name]',
		chunkNames: 'chunk-[hash]',
		outExtension: { '.js': '.mjs' },
		external: [
			'react',
			'react-dom',
			'react-dom/client',
			'react/jsx-runtime',
			'react/jsx-dev-runtime',
		],
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	});

	const files: Record<string, string> = {};
	for (const file of out.outputFiles) {
		files[file.path.replace(/^.*[/\\]/, '')] = file.text;
	}

	// The sandbox creates a blob URL per file and splices it into the files
	// that import it, so files must arrive dependencies-first. Topo-sort the
	// chunk graph (esbuild inter-chunk specifiers are exactly `./<name>.mjs`).
	const deps = new Map<string, string[]>();
	for (const [name, code] of Object.entries(files)) {
		const imported: string[] = [];
		for (const match of code.matchAll(/(["'])\.\/([\w.-]+\.mjs)\1/g)) {
			if (files[match[2]] && !imported.includes(match[2])) imported.push(match[2]);
		}
		deps.set(name, imported);
	}
	const order: string[] = [];
	const state = new Map<string, 'visiting' | 'done'>();
	const visit = (name: string, chain: string[]) => {
		if (state.get(name) === 'done') return;
		if (state.get(name) === 'visiting') {
			throw new Error(
				`playground runtime chunks import each other cyclically (${[...chain, name].join(' → ')}) — the sandbox's dependencies-first blob ordering cannot represent that`,
			);
		}
		state.set(name, 'visiting');
		for (const dep of deps.get(name) ?? []) visit(dep, [...chain, name]);
		state.set(name, 'done');
		order.push(name);
	};
	for (const name of deps.keys()) visit(name, []);

	return {
		entries: {
			octane: 'octane.mjs',
			'octane/internal/client': 'octane-internal-client.mjs',
			'octane/react': 'octane-react.mjs',
		},
		order,
		files,
	};
}

export function playgroundRuntime(): Plugin {
	const MANIFEST_PATH = '/playground-runtime.json'; // = RUNTIME_MANIFEST_PATH in playground-sandbox.ts
	const bundle = async () => JSON.stringify(await buildPlaygroundRuntimeManifest());

	return {
		name: 'octane-playground-runtime',
		configureServer(server) {
			server.middlewares.use(MANIFEST_PATH, (_req, res, next) => {
				// Rebuilt per request — esbuild bundles the runtime in ~15ms, and
				// this way dev never serves a stale runtime after octane edits.
				bundle().then((code) => {
					res.setHeader('Content-Type', 'application/json; charset=utf-8');
					res.end(code);
				}, next);
			});
		},
		async generateBundle() {
			if (this.environment.name !== 'client') return;
			this.emitFile({
				type: 'asset',
				fileName: MANIFEST_PATH.slice(1),
				source: await bundle(),
			});
		},
	};
}
