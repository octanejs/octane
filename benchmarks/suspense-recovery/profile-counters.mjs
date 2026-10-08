// Engine counters for no-boundary root suspension, from a DEV + PROFILING
// build of the same fixture and interaction as root-work.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectProfileCounters } from '../lib/profile-counters.mjs';
import {
	chromium,
	closeResources,
	countStat,
	environmentFor,
	hashOctaneSources,
	packageVersion,
} from '../activity/harness.mjs';
import { adapterSource } from './root-controls.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = path.resolve(here, '../..');
const scratch = path.join(here, 'dist/profile-counters');
const fixture = path.join(repo, 'packages/octane/tests/browser/suspense-hydration');
const requireNews = createRequire(path.join(repo, 'benchmarks/news/package.json'));
const requireOctane = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build, preview } = await import(pathToFileURL(requireNews.resolve('vite')));
const { octane } = await import(pathToFileURL(requireOctane.resolve('octane/compiler/vite')));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const sourceHash = hashOctaneSources(path.join(repo, 'packages/octane'));
const directInputs = Object.fromEntries(
	['index.html', 'main.ts', 'root-suspension.tsrx'].map((name) => [
		name,
		hash(fs.readFileSync(path.join(fixture, name))),
	]),
);
const shapes = ['component', 'branch', 'root', 'keyed', 'empty'];
const operations = ['hold', 'retry'];

// What each operation must do, whatever else changes: an urgent update that
// suspends with no boundary discards its whole root attempt, and the retry
// commits once without discarding anything.
function checkSemantics(label, operation, diff) {
	assert.equal(diff.build, 'development', `${label} runtime build`);
	assert.deepEqual(diff.renderers, ['dom'], `${label} renderers`);
	const counters = diff.counters;
	if (operation === 'hold') {
		assert.equal(counters['rollback.root'], 1, `${label} root rollbacks`);
		assert.equal(counters['commit.root'], 0, `${label} root commits`);
		assert.ok(counters['component.renderSuspended'] >= 1, `${label} suspended renders`);
	} else {
		assert.equal(counters['rollback.root'], 0, `${label} root rollbacks`);
		assert.equal(counters['commit.root'], 1, `${label} root commits`);
	}
}

const outDir = path.join(scratch, 'build');
const targets = [];
let server;
let browser;
let failed;
let environment;
let assets;

try {
	process.env.NODE_ENV = 'development';
	const result = await build({
		configFile: false,
		root: fixture,
		mode: 'development',
		logLevel: 'warn',
		plugins: [
			{
				name: 'root-suspension-profile-controls',
				enforce: 'pre',
				resolveId(request) {
					if (request === 'octane' || request.startsWith('octane/'))
						return requireOctane.resolve(request);
					if (
						request === 'react' ||
						request.startsWith('react/') ||
						request === 'react-dom' ||
						request.startsWith('react-dom/')
					)
						return requireOctane.resolve(request);
					return null;
				},
				transform(code, id) {
					return id === path.join(fixture, 'main.ts') ? `${code}${adapterSource}` : null;
				},
			},
			octane({ hmr: false, profile: true }),
		],
		define: {
			'process.env.NODE_ENV': JSON.stringify('development'),
			__OCTANE_PROFILE_ENABLED__: 'true',
		},
		build: { outDir, emptyOutDir: true, minify: false, target: 'esnext' },
	});
	assert.equal(
		hashOctaneSources(path.join(repo, 'packages/octane')),
		sourceHash,
		'Source changed during profile build',
	);
	for (const [name, digest] of Object.entries(directInputs))
		assert.equal(
			hash(fs.readFileSync(path.join(fixture, name))),
			digest,
			`Fixture changed: ${name}`,
		);
	const outputs = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output);
	assets = Object.fromEntries(
		outputs
			.filter((entry) => entry.type === 'chunk')
			.map((entry) => [entry.fileName, hash(entry.code)]),
	);
	console.log(`BUILD_READY ${sourceHash}`);
	server = await preview({
		configFile: false,
		root: fixture,
		logLevel: 'error',
		build: { outDir },
		preview: { host: '127.0.0.1', port: 0, strictPort: true },
	});
	const address = server.httpServer.address();
	assert.ok(address && typeof address !== 'string');
	browser = await chromium().launch({ headless: true, args: ['--no-sandbox'] });
	environment = environmentFor(browser);
	for (const shape of shapes) {
		for (const operation of operations) {
			const label = `${shape}/${operation}`;
			const diff = await collectProfileCounters(browser, {
				url: `http://127.0.0.1:${address.port}/?case=root-suspension&shape=${shape}&implementation=octane`,
				before: [
					'__rootPrepare',
					...(operation === 'retry' ? ['__rootHold', '__rootVerifyHold'] : []),
				],
				operation: operation === 'hold' ? '__rootHold' : '__rootRetry',
				after: [operation === 'hold' ? '__rootVerifyHold' : '__rootVerifyRetry', '__rootCleanup'],
			});
			checkSemantics(label, operation, diff);
			targets.push({
				name: `octane-${shape}-${operation}`,
				ops: Object.fromEntries(
					Object.entries(diff.counters).map(([key, value]) => [key, countStat(value)]),
				),
				meta: { correctness: 'pass', schema: diff.schema },
			});
			console.log(`PASS ${label} ${JSON.stringify(diff.counters)}`);
		}
	}
} catch (error) {
	failed = error instanceof Error ? error.stack : String(error);
} finally {
	const cleanupErrors = await closeResources(browser, server);
	if (cleanupErrors.length) failed = [failed, ...cleanupErrors].filter(Boolean).join('\n');
}

const payload = {
	suite: 'root-suspension-profile-counters',
	targets,
	meta: {
		sourceHash,
		directInputs,
		adapterHash: hash(adapterSource),
		assets,
		environment,
		node: process.version,
		vite: requireNews('vite/package.json').version,
		playwright: requireNews('playwright/package.json').version,
		tsrxCore: packageVersion(requireOctane, '@tsrx/core'),
		lockfileHash: hash(fs.readFileSync(path.join(repo, 'pnpm-lock.yaml'))),
		build: 'development',
		profile: true,
		iterations: 1,
		measurement:
			'Octane profiler counter snapshots around each operation in a fresh browser context; setup and semantic verification outside the snapshots.',
		limitations: [
			'Profile builds compile the generic DEV program, not production output; root-work.mjs remains the production work lane.',
			'Counters describe engine work, not time. Five bounded fixture shapes, not a scaling benchmark.',
		],
	},
	...(failed ? { failed } : {}),
};
const output = process.env.BENCH_JSON ?? path.join(scratch, 'result.json');
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
if (failed) {
	console.error(failed);
	process.exitCode = 1;
}
