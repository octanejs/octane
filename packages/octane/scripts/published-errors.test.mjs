import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { formatDevErrorMessage, formatProdErrorMessage } from '../src/error-message.ts';

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(packageDir, 'error-codes/codes.json'), 'utf8'));

const BROWSER = ['import', 'browser'];

// Resolves a published export the way a consumer with these conditions does.
function publishedPath(specifier, conditions = []) {
	const key = specifier === 'octane' ? '.' : `./${specifier.slice('octane/'.length)}`;
	let target = manifest.publishConfig.exports[key];
	while (target && typeof target === 'object') {
		const condition = Object.keys(target).find(
			(name) => name === 'default' || conditions.includes(name),
		);
		target = condition && target[condition];
	}
	if (typeof target !== 'string') throw new Error(`Missing published export ${specifier}`);
	return join(packageDir, target);
}

function expectedMessage(mode, code, args = []) {
	return mode === 'production'
		? formatProdErrorMessage(code, args)
		: formatDevErrorMessage(catalog.codes[code].message, args);
}

// Specialized (zero-argument), parameterized, and server-formatted errors, with
// the catalog code and arguments each one formats.
const CASES = [
	['specialized', 189, []],
	['parameterized', 151, ['synthetic scope']],
	['server', 30, ['bad tag']],
];

test('published ESM and CommonJS read NODE_ENV once, when each module loads', () => {
	const script = `
import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(join(packageDir, 'package.json'))});
const formats = [
	['ESM', await import(${JSON.stringify(pathToFileURL(publishedPath('octane/signals', ['node', 'import'])).href)}), await import(${JSON.stringify(pathToFileURL(publishedPath('octane/server', ['node', 'import'])).href)})],
	['CJS', require(${JSON.stringify(publishedPath('octane/signals', ['node', 'require']))}), require(${JSON.stringify(publishedPath('octane/server', ['node', 'require']))})],
];
const cases = (signals, server) => ({
	specialized: () => signals.installSignalOwnerEnvironment({}),
	parameterized: () => { throw new signals.ScopeDisposedError('synthetic scope'); },
	server: () => server.renderToString(() => server.createElement('bad tag', null)),
});
const observations = [];
function observe(phase) {
	for (const [format, signals, server] of formats) {
		for (const [kind, run] of Object.entries(cases(signals, server))) {
			try {
				run();
				observations.push({ phase, format, kind, name: null, message: null });
			} catch (error) {
				observations.push({ phase, format, kind, name: error.name, message: error.message });
			}
		}
	}
}
observe('loaded');
// Changing the environment after load does not re-select messages.
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'development' : 'production';
observe('changed');
// Nor does losing the process global mask the diagnostic being formatted.
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'process');
const stdout = process.stdout;
delete globalThis.process;
try {
	observe('without process');
} finally {
	Object.defineProperty(globalThis, 'process', descriptor);
}
stdout.write(JSON.stringify(observations));
`;
	const names = { specialized: 'TypeError', parameterized: 'ScopeDisposedError', server: 'Error' };
	for (const mode of [undefined, 'development', 'test', 'production']) {
		const env = { ...process.env };
		if (mode === undefined) delete env.NODE_ENV;
		else env.NODE_ENV = mode;
		const observations = JSON.parse(
			execFileSync(process.execPath, ['--input-type=module', '-e', script], {
				cwd: packageDir,
				encoding: 'utf8',
				env,
				stdio: ['ignore', 'pipe', 'inherit'],
			}),
		);
		assert.equal(observations.length, 3 * 2 * CASES.length);
		for (const { phase, format, kind, name, message } of observations) {
			const [, code, args] = CASES.find(([candidate]) => candidate === kind);
			const label = `${mode} ${phase} ${format} ${kind}`;
			assert.equal(name, names[kind], label);
			assert.equal(message, expectedMessage(mode, code, args), label);
		}
	}
});

// Bundles the published signals entry the way an application consumer does and
// evaluates it where no process global exists, as in a browser.
async function consumerBundles(mode) {
	const source =
		"export { installSignalOwnerEnvironment, ScopeDisposedError } from 'octane/signals';\n";
	const octane = /^octane(?:\/|$)/;
	const esbuildResult = await build({
		stdin: { contents: source, resolveDir: packageDir, loader: 'js' },
		bundle: true,
		write: false,
		format: 'cjs',
		minify: true,
		define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
		plugins: [
			{
				name: 'published-octane',
				setup(bundler) {
					bundler.onResolve({ filter: octane }, ({ path }) => ({
						path: publishedPath(path, BROWSER),
					}));
				},
			},
		],
		logLevel: 'silent',
	});
	const root = mkdtempSync(join(tmpdir(), 'octane-published-errors-'));
	try {
		writeFileSync(join(root, 'entry.js'), source);
		const [viteResult] = [].concat(
			await viteBuild({
				root,
				configFile: false,
				logLevel: 'silent',
				mode,
				plugins: [
					{
						name: 'published-octane',
						enforce: 'pre',
						resolveId: (specifier) =>
							octane.test(specifier) ? publishedPath(specifier, BROWSER) : null,
					},
				],
				build: {
					write: false,
					minify: mode === 'production',
					lib: { entry: join(root, 'entry.js'), formats: ['cjs'], fileName: 'entry' },
				},
				// Library mode keeps process.env.NODE_ENV for its own consumer; this
				// build stands in for that consumer's substitution.
				define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
			}),
		);
		return [
			['esbuild', esbuildResult.outputFiles[0].text],
			['vite', viteResult.output.find((chunk) => chunk.type === 'chunk').code],
		];
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test('consumer substitution selects messages and drops development branches', async () => {
	for (const mode of ['development', 'production']) {
		for (const [bundler, code] of await consumerBundles(mode)) {
			const label = `${bundler} ${mode}`;
			assert.doesNotMatch(code, /process\.env/, label);
			const module = { exports: {} };
			vm.runInNewContext(code, { module, exports: module.exports }, { filename: label });
			const { installSignalOwnerEnvironment, ScopeDisposedError } = module.exports;
			assert.throws(() => installSignalOwnerEnvironment({}), {
				name: 'TypeError',
				message: expectedMessage(mode, 189),
			});
			assert.equal(
				new ScopeDisposedError('synthetic scope').message,
				expectedMessage(mode, 151, ['synthetic scope']),
				label,
			);
			// The specialized message, the parameterized template, and the generic
			// formatter's table ship in development and are dropped in production.
			for (const message of [
				catalog.codes[189].message,
				catalog.codes[151].message.split('%s')[0],
				catalog.codes[1].message,
			]) {
				// Printers may emit the literal with escaped double quotes.
				const shipped =
					code.includes(message) || code.includes(JSON.stringify(message).slice(1, -1));
				assert.equal(shipped, mode === 'development', `${label}: ${message}`);
			}
		}
	}
});

test('a compiled binding consumer drops the generic error formatter in production', async () => {
	const fixtureDir = join(packageDir, '../../benchmarks/scoped-signals/native-presentation');
	const { compile } = await import('../dist/compiler/compile.js');
	const options = { mode: 'client', dev: false, hmr: false };
	const activatePath = join(fixtureDir, 'activate.tsrx');
	const viewPath = join(fixtureDir, 'View.tsrx');
	const result = await build({
		stdin: {
			contents: compile(readFileSync(activatePath, 'utf8'), activatePath, options).code,
			resolveDir: fixtureDir,
			loader: 'js',
		},
		bundle: true,
		write: false,
		metafile: true,
		format: 'esm',
		minify: true,
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		plugins: [
			{
				name: 'published-octane-and-binding-view',
				setup(bundler) {
					bundler.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path }) => ({
						path: publishedPath(path, BROWSER),
					}));
					bundler.onResolve({ filter: /\.tsrx\?octane-bindings=View$/ }, () => ({
						path: viewPath,
						namespace: 'binding-view',
					}));
					bundler.onLoad({ filter: /.*/, namespace: 'binding-view' }, () => ({
						contents: compile(
							readFileSync(viewPath, 'utf8'),
							`${viewPath}?octane-bindings=View`,
							options,
						).code,
						loader: 'js',
						resolveDir: fixtureDir,
					}));
				},
			},
		],
	});
	// Inputs include files esbuild visited but subsequently tree-shook; inspect
	// the emitted contribution rather than merely the resolver's input graph.
	const outputInputs = Object.values(result.metafile.outputs).flatMap((entry) =>
		Object.entries(entry.inputs)
			.filter(([, contribution]) => contribution.bytesInOutput > 0)
			.map(([name]) => name),
	);
	assert.doesNotMatch(
		outputInputs.join('\n'),
		/error-codes\.client\.generated\.js|error-message\.js/,
	);
	const output = result.outputFiles[0].text;
	assert.doesNotMatch(output, /encodeURIComponent|Maximum update depth exceeded/);
});
