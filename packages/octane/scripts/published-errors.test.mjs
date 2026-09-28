import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);

test('published ESM and CommonJS retain zero-argument and parameterized error messages', async () => {
	const modules = [
		{
			signals: await import('../dist/signals/index.js'),
			server: await import('../dist/server/index.js'),
		},
		{
			signals: require('../dist/cjs/signals/index.cjs'),
			server: require('../dist/cjs/server/index.cjs'),
		},
	];
	const previous = process.env.NODE_ENV;
	try {
		for (const { signals, server } of modules) {
			for (const mode of ['development', 'production', 'development']) {
				process.env.NODE_ENV = mode;
				const production = mode === 'production';
				assert.throws(() => signals.installSignalOwnerEnvironment({}), {
					name: 'TypeError',
					message: production
						? 'Minified Octane error #189; visit https://octanejs.dev/errors/189 for the full message or use a development build for full errors and additional helpful warnings.'
						: 'A signal owner environment requires current, run, and capture.',
				});
				assert.throws(() => server.renderToString(() => server.createElement('bad tag', null)), {
					name: 'Error',
					message: production
						? 'Minified Octane error #30; visit https://octanejs.dev/errors/30?args[]=bad%20tag for the full message or use a development build for full errors and additional helpful warnings.'
						: 'Invalid tag: bad tag',
				});
			}
		}
	} finally {
		if (previous === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = previous;
	}
});

test('a compiled binding consumer drops the generic error formatter in production', async () => {
	const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
	const fixtureDir = join(packageDir, '../../benchmarks/scoped-signals/native-presentation');
	const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
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
					bundler.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path }) => {
						const key = path === 'octane' ? '.' : `./${path.slice('octane/'.length)}`;
						const entry = manifest.publishConfig.exports[key];
						if (!entry) throw new Error(`Missing published export ${path}`);
						return { path: join(packageDir, typeof entry === 'string' ? entry : entry.default) };
					});
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
