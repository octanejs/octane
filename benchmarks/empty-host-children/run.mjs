// Array-expression counts use an observed build; timings use untouched production code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { build, transformSync } from 'esbuild';
import { chromium } from 'playwright';

const repo = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { parseModule, builders: b } = require('@tsrx/core');
const { print } = require('esrap');
const language = require('esrap/languages/tsx').default;
const runtime = path.join(repo, 'packages/octane/src/runtime.ts');
const runtimeSource = fs.readFileSync(
	process.env.EMPTY_HOST_RUNTIME || process.argv[2] || runtime,
	'utf8',
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const val = (score) => ({ score, median: score, min: score, samples: 1 });
const timing = process.env.EMPTY_HOST_TIMING === '1';
const built = await build({
	stdin: {
		contents: `export { createRoot, createElement, flushSync } from 'octane';`,
		resolveDir: repo,
	},
	bundle: true,
	write: false,
	format: 'iife',
	globalName: 'emptyHosts',
	platform: 'browser',
	target: 'es2022',
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	plugins: [
		{
			name: 'selected-runtime',
			setup(plugin) {
				plugin.onResolve({ filter: /^octane$/ }, () => ({
					path: path.join(repo, 'packages/octane/src/index.ts'),
				}));
				plugin.onLoad({ filter: /\/src\/runtime\.ts$/ }, () => ({
					contents: runtimeSource,
					loader: 'ts',
					resolveDir: path.dirname(runtime),
				}));
			},
		},
	],
});
const clean = transformSync(built.outputFiles[0].text, { minify: true, target: 'es2022' }).code;
let sites = 0;
const observeArray = parseModule('__observeEmptyHostArray(el);', 'counter.js').body[0].expression;
function instrument(node, active = false) {
	if (Array.isArray(node)) return node.map((item) => instrument(item, active));
	if (node === null || typeof node !== 'object' || typeof node.type !== 'string') return node;
	if (node.type === 'FunctionDeclaration') active = node.id?.name === 'reconcileDeoptChildren';
	let rewritten = node;
	for (const key of Object.keys(node)) {
		if (['loc', 'start', 'end', 'metadata', 'tokens', 'comments'].includes(key)) continue;
		const value = node[key];
		if (value === null || typeof value !== 'object') continue;
		const next = instrument(value, active);
		if (next === value) continue;
		if (rewritten === node) rewritten = { ...node };
		rewritten[key] = next;
	}
	if (active && node.type === 'ArrayExpression') {
		sites++;
		return b.sequence([observeArray, rewritten]);
	}
	return rewritten;
}
const observed =
	`function __observeEmptyHostArray(el) { if (el.localName === 'i') globalThis.__emptyArrays++; }\n` +
	print(instrument(parseModule(built.outputFiles[0].text, 'empty-hosts.js')), language()).code;
assert.ok(sites >= 2, 'no descriptor-child array expressions found');
const browser = await chromium.launch({ headless: true });
const metadata = {
	node: process.version,
	chromium: browser.version(),
	runtimeSha256: hash(runtimeSource),
	runnerSha256: hash(fs.readFileSync(import.meta.filename)),
	cleanSha256: hash(clean),
	arrayExpressionSites: sites,
	bundle_minified: Buffer.byteLength(clean),
	bundle_gzip: gzipSync(clean, { level: 9 }).length,
	measurement: 'executed child-reconciler array expressions on i hosts; no heap-allocation claim',
};
const targets = [];
try {
	for (const count of [128, 512]) {
		for (const mode of ['empty', 'text', 'nested']) {
			let control;
			for (const observe of [false, true]) {
				const page = await browser.newPage();
				try {
					await page.addScriptTag({ content: observe ? observed : clean });
					const result = await page.evaluate(
						({ count, mode, timing }) => {
							const { createRoot, createElement, flushSync } = globalThis.emptyHosts;
							globalThis.__emptyArrays = 0;
							const container = document.createElement('div');
							document.body.append(container);
							const ids = Array.from({ length: count }, (_, id) => id);
							const empty = [null, undefined, false, true, ''];
							let attaches = 0,
								detaches = 0,
								clicks = 0;
							const ref = () => {
								attaches++;
								return () => {
									detaches++;
								};
							};
							const onClick = () => {
								clicks++;
							};
							function App({ revision }) {
								return createElement(
									'section',
									null,
									ids.map((id) =>
										createElement(
											'i',
											{ key: id, 'data-id': id, 'data-revision': revision, ref, onClick },
											mode === 'empty'
												? empty[id % empty.length]
												: mode === 'text'
													? 'text:' + revision
													: [createElement('b', { key: 'child' }, 'nested:' + revision), '!'],
										),
									),
								);
							}
							const root = createRoot(container);
							root.render(App, { revision: 0 });
							flushSync(() => {});
							const operations = { mount: globalThis.__emptyArrays };
							const leaves = Array.from(container.querySelectorAll('i'));
							const firstChildren = leaves.map((leaf) => leaf.firstChild);
							const check = (revision) => {
								const next = container.querySelectorAll('i');
								if (next.length !== count) throw new Error('missing host');
								for (let index = 0; index < count; index++) {
									const leaf = next[index];
									if (
										leaf !== leaves[index] ||
										leaf.getAttribute('data-id') !== String(index) ||
										leaf.getAttribute('data-revision') !== String(revision)
									)
										throw new Error('host identity or props changed');
									if (leaf.firstChild !== firstChildren[index])
										throw new Error('child identity changed');
									const expected =
										mode === 'empty'
											? ''
											: mode === 'text'
												? 'text:' + revision
												: 'nested:' + revision + '!';
									if (leaf.textContent !== expected) throw new Error('child content changed');
								}
							};
							check(0);
							globalThis.__emptyArrays = 0;
							flushSync(() => root.render(App, { revision: 1 }));
							operations.update = globalThis.__emptyArrays;
							check(1);
							globalThis.__emptyArrays = 0;
							flushSync(() => root.render(App, { revision: 1 }));
							operations.unchanged = globalThis.__emptyArrays;
							check(1);
							const samples = [];
							if (timing) {
								for (let i = 0; i < 200; i++) flushSync(() => root.render(App, { revision: i }));
								for (let sample = 0; sample < 15; sample++) {
									const start = performance.now();
									for (let i = 0; i < 100; i++) flushSync(() => root.render(App, { revision: i }));
									samples.push((performance.now() - start) / 100);
								}
								check(99);
								flushSync(() => root.render(App, { revision: 1 }));
								check(1);
							}
							leaves[0].click();
							if (clicks !== 1 || attaches !== count || detaches !== 0)
								throw new Error('event or ref lifetime changed');
							const snapshot = { text: leaves[0].textContent, attaches, clicks };
							root.unmount();
							if (container.innerHTML !== '' || detaches !== count)
								throw new Error('unmount did not release hosts');
							container.remove();
							return { operations, snapshot, samples };
						},
						{ count, mode, timing: timing && !observe },
					);
					if (!observe) control = result;
					else {
						assert.deepEqual(result.snapshot, control.snapshot, 'observer changed semantics');
						for (const [operation, arrays] of Object.entries(result.operations)) {
							targets.push({
								name: `${mode}-${count}-${operation}`,
								ops: { array_expressions: val(arrays) },
								meta: { ...metadata, count, mode, snapshot: result.snapshot },
							});
						}
						if (timing) {
							const sorted = [...control.samples].sort((a, b) => a - b);
							targets.push({
								name: `${mode}-${count}-timing`,
								ops: {
									ms_per_update: {
										score: sorted[7],
										median: sorted[7],
										min: sorted[0],
										samples: sorted.length,
									},
								},
								meta: { ...metadata, rawSamples: control.samples },
							});
						}
					}
				} finally {
					await page.close();
				}
			}
		}
		targets.push({ name: `hosts-${count}`, ops: { array_expressions: val(count) } });
	}
	const output = { targets };
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(output, null, 2) + '\n');
	console.log(JSON.stringify(output, null, 2));
} finally {
	await browser.close();
}
