// Reuse the established minimal-import fixtures and executable oracles. This
// focused audit adds source-revision pinning and an ordinary descriptor control.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import { verifyScenario } from '../bundle-size/verify-reachability.mjs';
import {
	countStat,
	hashOctaneSources,
	octanePackageAt,
	packageVersion,
	parseOptions,
	writePayload,
} from './harness.mjs';

const options = parseOptions(process.argv.slice(2));
if (!options.targets.includes('octane-tsrx') || options.noBuild) {
	throw new Error('Activity bundle controls require an Octane build');
}
process.env.NODE_ENV = 'production';
const HERE = fileURLToPath(new URL('.', import.meta.url));
const requireFromNews = createRequire(new URL('../news/package.json', import.meta.url));
const source = octanePackageAt(options.revision);
const requireFromOctane = createRequire(path.join(source.packageRoot, 'package.json'));
const sourceHash = hashOctaneSources(source.packageRoot);
const { build } = await import(pathToFileURL(requireFromNews.resolve('vite')).href);
const { octane } = await import(
	pathToFileURL(requireFromOctane.resolve('octane/compiler/vite')).href
);
const { compile } = await import(pathToFileURL(requireFromOctane.resolve('octane/compiler')).href);
const { transformSync } = requireFromOctane('esbuild');
const toolchain = {
	node: process.version,
	vite: requireFromNews('vite/package.json').version,
	esbuild: requireFromOctane('esbuild').version,
	tsrxCore: packageVersion(requireFromOctane, '@tsrx/core'),
	parser: process.env.OCTANE_ACTIVITY_PARSER ?? 'package-default',
};
const outputRoot = path.join(
	HERE,
	'dist/bundle-controls',
	options.revision ? source.revision : 'working',
);
const scenarios = [
	['root-static-specialized', '../bundle-size/fixtures/minimal/root-static-specialized.ts'],
	['root-static', '../bundle-size/fixtures/minimal/root-static.tsrx'],
	['hooks-state', '../bundle-size/fixtures/minimal/hooks-state.tsrx'],
	['component-owned-effects', '../bundle-size/fixtures/minimal/component-owned-effects.ts'],
	['root-descriptor', './root-descriptor.ts', 'root-static'],
];
const targets = [];
let failure;

async function buildEntry(entry, minify) {
	const result = await build({
		configFile: false,
		root: HERE,
		mode: 'production',
		logLevel: 'error',
		plugins: [
			{
				name: 'activity-bundle-public-imports',
				enforce: 'pre',
				resolveId(request) {
					if (request === 'octane' || request.startsWith('octane/')) {
						return requireFromOctane.resolve(request);
					}
					return null;
				},
			},
			octane({ hmr: false, profile: false }),
		],
		define: {
			__OCTANE_PROFILE_ENABLED__: 'false',
			'process.env.NODE_ENV': JSON.stringify('production'),
		},
		build: {
			write: false,
			minify,
			target: 'esnext',
			lib: { entry, formats: ['iife'], name: '__OCTANE_REACHABILITY__' },
		},
	});
	const built = Array.isArray(result) ? result : [result];
	assert.equal(built.length, 1, 'Expected one production build');
	const chunks = built[0].output.filter((file) => file.type === 'chunk');
	assert.equal(chunks.length, 1, 'Expected one executable bundle');
	assert.deepEqual(chunks[0].imports, [], 'Unexpected external dependency');
	assert.deepEqual(chunks[0].dynamicImports, [], 'Deferred bytes escaped the measured bundle');
	return chunks[0];
}

try {
	for (const [name, relative, oracle = name] of scenarios) {
		const entry = path.resolve(HERE, relative);
		const chunk = await buildEntry(entry, 'esbuild');
		const snapshot = await verifyScenario(oracle, chunk.code);
		const diagnostic = await buildEntry(entry, false);
		// This is an optimization diagnostic, not a correctness assertion about
		// private runtime names. Renaming/replacing a feature requires reviewing
		// this reachability probe alongside the authoritative byte totals.
		const activityReachable = /\bfunction (?:activityBlock|hideActivityRange)\s*\(/.test(
			diagnostic.code,
		);
		const bytes = Buffer.from(chunk.code);
		const measured = {
			raw: bytes.length,
			gzip: gzipSync(bytes, { level: zlib.Z_BEST_COMPRESSION }).length,
			brotli: brotliCompressSync(bytes, {
				params: { [zlib.BROTLI_PARAM_QUALITY]: zlib.BROTLI_MAX_QUALITY },
			}).length,
			activity_reachable: Number(activityReachable),
		};
		fs.mkdirSync(outputRoot, { recursive: true });
		fs.writeFileSync(path.join(outputRoot, `${name}.js`), chunk.code);
		fs.writeFileSync(path.join(outputRoot, `${name}.diagnostic.js`), diagnostic.code);
		targets.push({
			name: `activity-bundle-${name}`,
			ops: Object.fromEntries(
				Object.entries(measured).map(([metric, value]) => [metric, countStat(value)]),
			),
			meta: {
				octaneRevision: source.revision,
				octaneSource: source.packageRoot,
				octaneSourceSha256: sourceHash,
				parser: process.env.OCTANE_ACTIVITY_PARSER ?? 'package-default',
				toolchain,
				bundleSha256: createHash('sha256').update(chunk.code).digest('hex'),
				entry,
				oracle,
				snapshot,
				activityReachable,
				build: outputRoot,
			},
		});
		console.log(`PASS activity/bundle/${name}: ${JSON.stringify(measured)}`);
	}
	for (const name of ['App', 'RefControl']) {
		const entry = path.join(HERE, `${name}.tsrx`);
		const { code } = compile(fs.readFileSync(entry, 'utf8'), entry, {
			mode: 'client',
			hmr: false,
			dev: false,
			profile: false,
		});
		const minified = transformSync(code, { loader: 'js', minify: true }).code;
		const measured = {
			raw: Buffer.byteLength(code),
			minified: Buffer.byteLength(minified),
			gzip: gzipSync(Buffer.from(minified), { level: zlib.Z_BEST_COMPRESSION }).length,
		};
		fs.writeFileSync(path.join(outputRoot, `${name}.compiled.js`), code);
		targets.push({
			name: `activity-codegen-${name}`,
			ops: Object.fromEntries(
				Object.entries(measured).map(([metric, value]) => [metric, countStat(value)]),
			),
			meta: {
				octaneRevision: source.revision,
				octaneSourceSha256: sourceHash,
				parser: process.env.OCTANE_ACTIVITY_PARSER ?? 'package-default',
				toolchain,
				entry,
				codeSha256: createHash('sha256').update(code).digest('hex'),
				semanticControl:
					'the same authored fixture is executed by activity/run.mjs or activity/refs.mjs',
			},
		});
		console.log(`PASS activity/codegen/${name}: ${JSON.stringify(measured)}`);
	}
	targets.push({
		name: 'activity-bundle-model',
		ops: { activity_reachable: countStat(1) },
		meta: { note: 'A unit denominator for optional Activity implementation reachability.' },
	});
	assert.equal(
		hashOctaneSources(source.packageRoot),
		sourceHash,
		'Octane source changed during bundle controls',
	);
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
}

writePayload({
	suite: 'activity-bundle',
	targets,
	...(failure ? { failed: failure } : {}),
});
if (failure) {
	console.error(`FAIL Activity bundle controls: ${failure}`);
	process.exitCode = 1;
}
