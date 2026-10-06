// Client-only hydration reachability: a client that only calls createRoot must
// retain no hydration code, under Vite (Rolldown) and under esbuild.
//
//   node run-hydration-free.mjs [scenario...]
//
// Each bundle is the bundler's ordinary production output: Vite 8 with its
// default oxc minifier, and esbuild with `minify: true` (the #1785 probe). The
// oracle is the bundle's source map (hydration-free-gates.mjs): the gate fails
// when any generated code maps into a declaration in HYDRATION_ONLY_DECLARATIONS,
// or when a module under packages/octane/src/hydration/ is bundled. esbuild
// cannot fold a module flag, so its bundles are not held to the `foldOnly` state
// cells and accessors; they must still drop every hydration body. Hydrating
// control bundles must map into every deny-listed declaration, which proves the
// oracle sees each one under the same settings.
//
// Vite's `minify: 'esbuild'` mode turns Rolldown's own minifier off, and with it
// the dead-code elimination that removes branches guarded by a never-written
// module flag. This gate measures Vite's default minifier, which applications
// get unless they opt out.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as buildEsbuild } from 'esbuild';
import { createOctaneCompiler } from 'octane/compiler/bundler';
import { octane } from 'octane/compiler/vite';
import { build as buildVite, parseAst } from 'vite';
import {
	deniedRangesFor,
	resolveDeclarationRanges,
	retainedDeclarations,
	verifyControlCoverage,
	verifyHydrationFree,
} from './hydration-free-gates.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../..');
const minimal = path.join(directory, 'fixtures/minimal');
const probes = path.join(directory, 'fixtures/hydration-free');
const octaneSource = path.join(repository, 'packages/octane/src');
const productionDefines = {
	__OCTANE_PROFILE_ENABLED__: 'false',
	'process.env.NODE_ENV': JSON.stringify('production'),
};

// Clients that never hydrate: the #1785 public-root probe under both bundlers,
// a signal-declaring root under both bundlers, every renderer feature fixture
// that run-minimal treats as hydration-free, and a complete compiled
// application.
const clients = [
	{
		name: 'create-root-export-vite',
		bundler: 'vite',
		entry: path.join(probes, 'create-root-export.ts'),
	},
	{
		name: 'create-root-export-esbuild',
		bundler: 'esbuild',
		entry: path.join(probes, 'create-root-export.ts'),
	},
	{
		name: 'create-root-signals-vite',
		bundler: 'vite',
		entry: path.join(probes, 'create-root-signals.tsrx'),
	},
	{
		name: 'create-root-signals-esbuild',
		bundler: 'esbuild',
		entry: path.join(probes, 'create-root-signals.tsrx'),
		compile: true,
	},
	...[
		['root-static', 'tsrx'],
		['root-static-local', 'tsrx'],
		['root-static-specialized', 'ts'],
		['root-chained-jsx', 'tsx'],
		['hooks-state', 'tsrx'],
		['prop-attributes', 'tsrx'],
		['context', 'tsrx'],
		['suspense-transition', 'tsrx'],
	].map(([id, extension]) => ({
		name: `${id}-vite`,
		bundler: 'vite',
		entry: path.join(minimal, `${id}.${extension}`),
	})),
	{
		name: 'root-static-esbuild',
		bundler: 'esbuild',
		entry: path.join(minimal, 'root-static.tsrx'),
		compile: true,
	},
	{
		name: 'js-framework-octane-tsrx-vite',
		bundler: 'vite-app',
		root: path.join(repository, 'benchmarks/js-framework/octane-tsrx'),
	},
];
// Hydrating controls: together they must retain every deny-listed declaration.
const controls = [
	{ name: 'hydrate-root-vite', bundler: 'vite', entry: path.join(minimal, 'hydrate-root.tsrx') },
	{
		name: 'deferred-hydration-vite',
		bundler: 'vite',
		entry: path.join(minimal, 'deferred-hydration.tsrx'),
	},
	{
		name: 'hydrate-root-export-esbuild',
		bundler: 'esbuild',
		entry: path.join(probes, 'hydrate-root-export.ts'),
	},
];

const requested = process.argv.slice(2);
for (const argument of requested) {
	assert.equal(
		clients.some(({ name }) => name === argument),
		true,
		`Unknown hydration-free scenario: ${argument}`,
	);
}
const selectedClients = requested.length
	? clients.filter(({ name }) => requested.includes(name))
	: clients;
const compiler = createOctaneCompiler({ root: directory });

function compileSourcePlugin(scenario) {
	return {
		name: 'octane-hydration-free-source',
		setup(build) {
			build.onLoad({ filter: /\.(?:tsrx|[jt]sx?)$/ }, ({ path: filename }) => {
				const template = filename.endsWith('.tsrx');
				const result = compiler.transform(fs.readFileSync(filename, 'utf8'), filename, {
					environment: 'client',
					hmr: false,
					dev: false,
					profile: false,
				});
				if (template) {
					assert.equal(result?.kind, 'compile', `${scenario.name}: uncompiled Octane template`);
				}
				if (result === null || result.kind === 'none') return null;
				// Match Vite: compiled `.ts`/`.tsx` output keeps TypeScript, which the
				// TS loader lowers. Compiled `.tsrx` output is JavaScript.
				return {
					contents: result.code,
					loader: template ? 'js' : path.extname(filename).slice(1),
				};
			});
		},
	};
}

async function buildScenario(scenario) {
	if (scenario.bundler === 'esbuild') {
		const result = await buildEsbuild({
			absWorkingDir: repository,
			entryPoints: [scenario.entry],
			// Never written: an external source map needs an output path.
			outfile: path.join(directory, '.hydration-free', `${scenario.name}.js`),
			bundle: true,
			write: false,
			format: 'esm',
			platform: 'browser',
			target: 'es2022',
			minify: true,
			treeShaking: true,
			sourcemap: 'external',
			metafile: true,
			logLevel: 'silent',
			define: productionDefines,
			plugins: scenario.compile ? [compileSourcePlugin(scenario)] : [],
		});
		const maps = result.outputFiles.filter((file) => file.path.endsWith('.map'));
		assert.equal(maps.length, 1, `${scenario.name}: expected one esbuild source map`);
		const [output] = Object.values(result.metafile.outputs).filter(
			(file) => file.entryPoint !== undefined,
		);
		return {
			maps: [JSON.parse(maps[0].text)],
			modules: Object.entries(output.inputs)
				.filter(([, input]) => input.bytesInOutput > 0)
				.map(([id]) => path.resolve(repository, id)),
		};
	}
	const app = scenario.bundler === 'vite-app';
	const result = await buildVite({
		configFile: false,
		root: app ? scenario.root : directory,
		mode: 'production',
		logLevel: 'error',
		plugins: [octane({ hmr: false })],
		define: productionDefines,
		build: {
			write: false,
			target: 'esnext',
			sourcemap: true,
			...(app ? null : { lib: { entry: scenario.entry, formats: ['es'] } }),
		},
	});
	const built = Array.isArray(result) ? result : [result];
	assert.equal(built.length, 1, `${scenario.name}: expected exactly one production build`);
	const chunks = built[0].output.filter((file) => file.type === 'chunk');
	assert.notEqual(chunks.length, 0, `${scenario.name}: expected an executable bundle`);
	for (const chunk of chunks)
		assert.ok(chunk.map, `${scenario.name}: ${chunk.fileName} has no source map`);
	return {
		maps: chunks.map((chunk) => chunk.map),
		modules: chunks.flatMap((chunk) =>
			Object.entries(chunk.modules)
				.filter(([, module]) => module.renderedLength > 0)
				.map(([id]) => id),
		),
	};
}

const ranges = resolveDeclarationRanges(
	(source) => fs.readFileSync(path.join(octaneSource, source), 'utf8'),
	(text, source) => parseAst(text, { lang: 'ts' }, source),
);
// Non-vacuity: a client bundle must retain its public root.
const rootRanges = resolveDeclarationRanges(
	(source) => fs.readFileSync(path.join(octaneSource, source), 'utf8'),
	(text, source) => parseAst(text, { lang: 'ts' }, source),
	[
		{ name: 'createRoot', source: 'runtime.ts' },
		{ name: '__createVoidRoot', source: 'runtime.ts' },
	],
);
const retainedBy = (maps, candidates) => {
	const retained = new Set();
	for (const map of maps)
		for (const name of retainedDeclarations(map, candidates)) retained.add(name);
	return retained;
};

const failures = [];
const controlRetained = new Map();
for (const scenario of controls) {
	const { maps } = await buildScenario(scenario);
	controlRetained.set(scenario.name, retainedBy(maps, ranges));
	console.log(`${scenario.name.padEnd(34)} control`);
}
try {
	verifyControlCoverage(controlRetained, ranges);
} catch (error) {
	failures.push(error);
}

for (const scenario of selectedClients) {
	const { maps, modules } = await buildScenario(scenario);
	assert.notEqual(
		retainedBy(maps, rootRanges).size,
		0,
		`${scenario.name}: the client bundle lost its public root`,
	);
	const denied = deniedRangesFor(scenario.bundler === 'esbuild' ? 'esbuild' : 'rolldown', ranges);
	const retained = retainedBy(maps, denied);
	let clean = true;
	try {
		verifyHydrationFree(scenario.name, { retained, modules }, denied);
	} catch (error) {
		clean = false;
		failures.push(error);
	}
	console.log(
		`${scenario.name.padEnd(34)} ${clean ? 'hydration-free' : `RETAINS ${retained.size} hydration-only declaration(s)`}`,
	);
}

if (failures.length !== 0) {
	console.error(
		`\nHYDRATION REACHABILITY FAIL (${ranges.length} deny-listed declarations):\n\n` +
			failures.map((error) => error.message).join('\n\n'),
	);
	process.exitCode = 1;
}
