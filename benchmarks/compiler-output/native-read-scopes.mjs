// Native-read modules (any module importing octane/signals) bracket compiled
// block bodies with beginNativeReadScope/endNativeReadScope. Empty arms have no
// code that can read, so they should compile to bodiless functions. This counts
// emitted empty brackets, then runs the compiled modules through public roots
// while a signal drives the reading arm, counting runtime scope entries.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const REPO = path.resolve(import.meta.dirname, '../..');
const SOURCE_REPO = path.resolve(process.argv[2] ?? REPO);
const compilerFile = path.join(SOURCE_REPO, 'packages/octane/src/compiler/compile.js');
const { compile } = await import(pathToFileURL(compilerFile));
const dependencies = createRequire(path.join(REPO, 'packages/octane/package.json'));
const { build, transformSync } = dependencies('esbuild');
const { Window } = await import(pathToFileURL(dependencies.resolve('happy-dom')));
const window = new Window({ url: 'http://localhost/' });
for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Text', 'Comment']) {
	globalThis[name] = name === 'window' ? window : window[name];
}

const CYCLES = 64;
const SIGNALS = "import { createScope } from 'octane/signals';\n";
const SOURCES = {
	emptyThen: `${SIGNALS}export function App(props) @{ <section>@if (props.on) {} @else { <b>{String(props.count$.get())}</b> }</section> }`,
	emptyElse: `${SIGNALS}export function App(props) @{ <section>@if (props.on) { <b>{String(props.count$.get())}</b> } @else {}</section> }`,
	// Control: both arms render, so both keep their brackets.
	bothArms: `${SIGNALS}export function App(props) @{ <section>@if (props.on) { <i>{'off'}</i> } @else { <b>{String(props.count$.get())}</b> }</section> }`,
};
const READING_WHEN_ON = { emptyThen: false, emptyElse: true, bothArms: false };

// A bracket whose try block is empty: `beginNativeReadScope(...); let x = true; try {} catch`.
const EMPTY_BRACKET = /beginNativeReadScope\([^)]*\);\s*let [\w$]+ = true;\s*try \{\s*\} catch/g;
const SCOPE_SITES = /_\$beginNativeReadScope\(/g;

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-native-read-scopes-'));
const shim = path.join(scratch, 'internal-client-shim.ts');
fs.writeFileSync(
	shim,
	`export * from ${JSON.stringify(path.join(SOURCE_REPO, 'packages/octane/src/internal/client.ts'))};
import { beginNativeReadScope as begin } from ${JSON.stringify(path.join(SOURCE_REPO, 'packages/octane/src/internal/client.ts'))};
export function beginNativeReadScope(scope, abi) {
	globalThis.__nativeReadScopes++;
	return begin(scope, abi);
}
`,
);
const rows = [];
try {
	for (const [name, source] of Object.entries(SOURCES)) {
		const { code } = compile(source, `${name}.tsrx`, { mode: 'client', dev: false, hmr: false });
		const minified = transformSync(code, { loader: 'js', minify: true }).code;
		const outfile = path.join(scratch, `${name}.mjs`);
		await build({
			stdin: {
				contents: `${code}\nexport { createRoot, flushSync } from "octane";\nexport { createScope as __createScope } from "octane/signals";`,
				resolveDir: REPO,
				loader: 'js',
			},
			outfile,
			bundle: true,
			format: 'esm',
			platform: 'node',
			logLevel: 'silent',
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			nodePaths: [path.join(REPO, 'node_modules'), path.join(REPO, 'packages/octane/node_modules')],
			plugins: [
				{
					name: 'source-runtime',
					setup(plugin) {
						plugin.onResolve({ filter: /^octane(?:\/internal\/client|\/signals)?$/ }, (args) => {
							if (args.path === 'octane/internal/client' && args.importer !== shim)
								return { path: shim };
							const file =
								{ octane: 'index.ts', 'octane/signals': 'signals/index.ts' }[args.path] ??
								'internal/client.ts';
							return { path: path.join(SOURCE_REPO, 'packages/octane/src', file) };
						});
					},
				},
			],
		});
		globalThis.__nativeReadScopes = 0;
		const { App, createRoot, flushSync, __createScope } = await import(pathToFileURL(outfile));
		const scope = __createScope({ scopeKey: `native-read-scopes-${name}` });
		const count$ = scope.signal$('count', 0);
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const reading = READING_WHEN_ON[name];
		flushSync(() => root.render(App, { on: reading, count$ }));
		globalThis.__nativeReadScopes = 0;
		// Each cycle: update the signal while the reading arm is shown, switch to
		// the other arm, render it again, then switch back.
		for (let index = 1; index <= CYCLES; index++) {
			flushSync(() => count$.set(index));
			assert.equal(container.textContent, String(index), `${name}: signal-driven text`);
			flushSync(() => root.render(App, { on: !reading, count$ }));
			flushSync(() => root.render(App, { on: !reading, count$ }));
			assert.equal(container.textContent, name === 'bothArms' ? 'off' : '', `${name}: other arm`);
			flushSync(() => root.render(App, { on: reading, count$ }));
			assert.equal(container.textContent, String(index), `${name}: reading arm restored`);
		}
		const scopes = globalThis.__nativeReadScopes;
		root.unmount();
		container.remove();
		rows.push({
			name,
			scope_sites: (code.match(SCOPE_SITES) ?? []).length,
			empty_brackets: (code.match(EMPTY_BRACKET) ?? []).length,
			runtime_scopes: scopes,
			minified: minified.length,
			gzip: gzipSync(minified).length,
		});
	}
	const stamp = (value) => ({ score: value, median: value, min: value, samples: 1 });
	const report = {
		suite: 'compiler-output',
		cycles: CYCLES,
		node: process.version,
		compilerSha256: createHash('sha256').update(fs.readFileSync(compilerFile)).digest('hex'),
		sourceSha256: createHash('sha256').update(JSON.stringify(SOURCES)).digest('hex'),
		rows,
		targets: rows.flatMap((row) => [
			{
				name: `native-read-${row.name}`,
				ops: Object.fromEntries(
					Object.entries(row)
						.filter(([key]) => key !== 'name')
						.map(([key, value]) => [key, stamp(value)]),
				),
			},
			{ name: `native-read-${row.name}-model`, ops: { empty_brackets: stamp(1) } },
		]),
	};
	const output = JSON.stringify(report, null, 2) + '\n';
	if (process.env.BENCH_JSON) fs.writeFileSync(path.resolve(process.env.BENCH_JSON), output);
	console.log(output.trimEnd());
} finally {
	delete globalThis.__nativeReadScopes;
	fs.rmSync(scratch, { recursive: true, force: true });
	await window.happyDOM.close();
}
