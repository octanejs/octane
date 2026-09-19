import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
process.env.NODE_ENV = 'production';
const [baselineRoot, candidateRoot, toolingRoot, output] = process.argv
	.slice(2)
	.map((x) => path.resolve(x));
const require = createRequire(path.join(toolingRoot, 'packages/octane/package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')));
const hash = (x) => createHash('sha256').update(x).digest('hex');
const view = path.join(baselineRoot, 'benchmarks/scoped-signals/dom-bindings.tsrx');
const authored = {
	engine: "export {createScope,query} from 'octane/signals';",
	'used-native-ssr': `import {renderToString} from 'octane/server';
import {createScope} from 'octane/signals';
import {DirectStyles} from ${JSON.stringify(view)};
export function render() {const scope=createScope({scopeKey:'used-native-ssr'});try{return renderToString(DirectStyles,{left$:scope.signal$('left',1),right$:scope.signal$('right',2),record(){}});}finally{scope.dispose();}}
`,
};
const rows = [];
for (const [variant, sourceRoot] of [
	['baseline', baselineRoot],
	['candidate', candidateRoot],
]) {
	const packageRoot = path.join(sourceRoot, 'packages/octane');
	const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json')));
	const { createOctaneCompiler } = await import(
		pathToFileURL(path.join(packageRoot, 'src/compiler/bundler.js'))
	);
	const { octane } = await import(pathToFileURL(path.join(packageRoot, 'src/compiler/vite.js')));
	const compiler = createOctaneCompiler({
		root: path.join(baselineRoot, 'benchmarks'),
		requireDirective: false,
		hmr: false,
		dev: false,
		profile: false,
	});
	const snapshot = new Map();
	function freeze(dir) {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const file = path.join(dir, entry.name);
			if (entry.isDirectory()) freeze(file);
			else if (entry.isFile()) snapshot.set(file, hash(fs.readFileSync(file)));
		}
	}
	freeze(path.join(packageRoot, 'src'));
	for (const [id, source] of Object.entries(authored)) {
		const environment = id === 'engine' ? 'client' : 'server';
		const entry = path.join(baselineRoot, 'benchmarks/scoped-signals', id + '-audit-entry.ts');
		let modules;
		const result = await build({
			configFile: false,
			root: path.join(baselineRoot, 'benchmarks'),
			mode: 'production',
			logLevel: 'error',
			ssr: { noExternal: true },
			plugins: [
				{
					name: 'matched-source-entry',
					enforce: 'pre',
					resolveId(request) {
						if (request === entry) return entry;
						const rewritten = compiler.resolveRuntimeRequest(request, environment) ?? request;
						if (rewritten === 'octane' || rewritten.startsWith('octane/')) {
							const target =
								manifest.exports[rewritten === 'octane' ? '.' : '.' + rewritten.slice(6)];
							assert.equal(typeof target, 'string');
							return path.resolve(packageRoot, target);
						}
					},
					load(id) {
						if (id === entry) return source;
					},
				},
				octane({ hmr: false, ssr: environment === 'server' }),
				{
					name: 'record-closure',
					generateBundle(_, bundle) {
						modules = Object.values(bundle)
							.filter((x) => x.type === 'chunk')
							.flatMap((chunk) =>
								Object.entries(chunk.modules).map(([file, meta]) => ({
									path: file,
									logicalPath: file.startsWith(sourceRoot + '/')
										? file.slice(sourceRoot.length + 1)
										: file,
									renderedLength: meta.renderedLength,
									renderedExports: meta.renderedExports,
								})),
							);
					},
				},
			],
			define: { __OCTANE_PROFILE_ENABLED__: 'false', 'process.env.NODE_ENV': '"production"' },
			build: {
				ssr: environment === 'server' ? entry : false,
				write: false,
				minify: 'esbuild',
				target: 'esnext',
				lib: { entry, formats: ['es'] },
				rollupOptions: { output: { inlineDynamicImports: true } },
			},
		});
		const outputs = Array.isArray(result) ? result : [result];
		assert.equal(outputs.length, 1);
		const chunks = outputs[0].output.filter((x) => x.type === 'chunk');
		assert.equal(chunks.length, 1);
		assert.deepEqual(chunks[0].dynamicImports, []);
		assert.deepEqual(
			chunks[0].imports.filter((x) => !x.startsWith('node:')),
			[],
			'Whole closure must retain all user payload',
		);
		const code = chunks[0].code;
		const api = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
		let smoke;
		if (id === 'engine') {
			assert.deepEqual(Object.keys(api).sort(), ['createScope', 'query']);
			const scope = api.createScope({ scopeKey: 'engine-vite' });
			try {
				const a = scope.signal$('a', 1);
				const b = scope.derived$('b', () => scope.get(a) * 2);
				const values = [];
				const stop = b.subscribe(() => values.push(scope.get(b)));
				assert.equal(scope.get(b), 2);
				scope.set(a, 2);
				assert.equal(scope.get(b), 4);
				assert.deepEqual(values, [4]);
				stop();
				smoke = { initial: 2, updated: 4, notifications: values };
			} finally {
				scope.dispose();
			}
			assert.deepEqual(
				modules.filter((x) => /\/src\/(?:runtime(?:\.server)?\.ts|server\/)/.test(x.path)),
				[],
				'Engine must remain renderer-free',
			);
		} else {
			smoke = api.render();
			assert.ok(smoke.html.includes('stable'));
			assert.ok(smoke.html.includes('left:1px'));
			assert.ok(smoke.html.includes('right:2px'));
		}
		const row = {
			variant,
			id,
			bundler: 'vite',
			environment,
			raw: Buffer.byteLength(code),
			gzip: gzipSync(code, { level: 9 }).length,
			brotli: brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
			sha256: hash(code),
			coordinator: modules.filter((x) => x.path.includes('/signals/transition-coordinator.')),
			modules,
			authored: source,
			smoke,
		};
		rows.push(row);
		console.log(
			JSON.stringify({
				variant,
				id,
				raw: row.raw,
				gzip: row.gzip,
				brotli: row.brotli,
				coordinator: row.coordinator,
			}),
		);
	}
	assert.deepEqual(
		[...snapshot]
			.filter(([file, before]) => hash(fs.readFileSync(file)) !== before)
			.map(([file]) => file),
		[],
		'Source drift',
	);
}
fs.writeFileSync(
	output,
	JSON.stringify(
		{
			node: process.version,
			request: process.argv,
			runnerSha256: hash(fs.readFileSync(import.meta.filename)),
			rows,
		},
		null,
		2,
	) + '\n',
);
