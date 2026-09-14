// Production key work with public output, identity and input-state controls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const sourceRoot = path.resolve(process.env.CLIENT_SOURCE_ROOT || repo);
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = require('esbuild');
const { chromium } = createRequire(path.join(repo, 'benchmarks/js-framework/package.json'))(
	'playwright',
);
const { compile } = await import(
	pathToFileURL(path.join(repo, 'packages/octane/src/compiler/index.js'))
);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'client-key-work-'));
const source = fs.readFileSync(path.join(sourceRoot, 'packages/octane/src/runtime.ts'), 'utf8');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const stat = (value) => ({ score: value, median: value, min: value, samples: 1 });
const count = 128;
const kinds = [
	'flat-implicit',
	'flat-explicit',
	'nested-implicit',
	'nested-explicit',
	'escaped-explicit',
	'custom-json-explicit',
];
const fixture = `
export function Rows(p) @{ <ul data-version={p.version}>{p.rows}</ul> }
export function Leaf(p) @{ <input aria-label="component" defaultValue={p.label} /> }
export function Slot(p) @{ <Leaf key={p.id} label={p.label} /> }
`;

function instrument(text) {
	const replacements = [
		[
			"outKeys.push(explicit ? 'k' + String(key) : index);",
			"globalThis.__keyWork[explicit ? 'flat_explicit' : 'flat_implicit']++; outKeys.push(explicit ? 'k' + String(key) : index);",
		],
		[
			"return '[' + JSON.stringify(path) + ',';",
			"globalThis.__keyWork.path_json++; return '[' + JSON.stringify(path) + ',';",
		],
		[
			'outKeys.push(\n\t\t\t\texplicit\n',
			"globalThis.__keyWork[explicit ? 'scalar_json' : 'nested_implicit']++; outKeys.push(\n\t\t\t\texplicit\n",
		],
		[
			"outKeys.push(JSON.stringify([path, explicit ? 'key' : 'index', explicit ? String(key) : index]));",
			"globalThis.__keyWork.tuple_json++; outKeys.push(JSON.stringify([path, explicit ? 'key' : 'index', explicit ? String(key) : index]));",
		],
		[
			"const nextKey = key === undefined ? NO_KEY : '' + key;",
			"if(key !== undefined) globalThis.__keyWork.component_coercions++; const nextKey = key === undefined ? NO_KEY : '' + key;",
		],
	];
	for (const [before, after] of replacements) {
		assert.equal(text.split(before).length, 2, 'review changed key observer: ' + before);
		text = text.replace(before, after);
	}
	return text;
}

// Descriptor construction stays outside the observed update. Numeric and string
// explicit keys already normalize at createElement; their descriptor keys are strings.
function makeRows(h, kind, count, reverse = false) {
	const explicit = kind.includes('explicit');
	const rows = Array.from({ length: count }, (_, i) =>
		h(
			'li',
			{
				key: explicit ? (kind === 'escaped-explicit' ? `row${i}:\"\\\n[],key` : i) : undefined,
				'data-row': i,
			},
			h('input', { defaultValue: String(i), 'aria-label': `row ${i}` }),
		),
	);
	rows.splice(
		1,
		0,
		h(
			'li',
			{ key: explicit ? '0-explicit' : '0', 'data-row': 'explicit' },
			h('input', { defaultValue: 'explicit', 'aria-label': 'explicit' }),
		),
	);
	if (reverse) rows.reverse();
	return !kind.startsWith('flat')
		? [rows, h('li', { key: 'tail', 'data-row': 'tail' }, 'tail')]
		: rows;
}

async function bundle(mode, observed = false) {
	const server = mode === 'server';
	const fixturePath = path.join(temp, `fixture-${mode}.js`);
	fs.writeFileSync(
		fixturePath,
		compile(fixture, 'client-key-work.tsrx', { mode: server ? 'server' : 'client', hmr: false })
			.code,
	);
	const output = await build({
		stdin: {
			contents: `export * as runtime from 'octane'; export * as fixture from ${JSON.stringify(fixturePath)};`,
			resolveDir: repo,
			sourcefile: 'key-entry.js',
		},
		bundle: true,
		write: false,
		minify: true,
		format: server ? 'esm' : 'iife',
		globalName: 'keyBench',
		platform: server ? 'node' : 'browser',
		target: 'esnext',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [path.join(repo, 'packages/octane/node_modules'), path.join(repo, 'node_modules')],
		plugins: [
			{
				name: 'key-source',
				setup(plugin) {
					plugin.onResolve(
						{ filter: /^octane(?:\/server|\/internal\/client)?$/ },
						({ path: name }) => ({
							path: path.join(
								sourceRoot,
								name === 'octane/internal/client'
									? 'packages/octane/src/internal/client.ts'
									: server || name === 'octane/server'
										? 'packages/octane/src/server/index.ts'
										: 'packages/octane/src/index.ts',
							),
						}),
					);
					if (observed)
						plugin.onLoad({ filter: /runtime\.ts$/ }, () => ({
							contents: instrument(source),
							loader: 'ts',
						}));
				},
			},
		],
	});
	return output.outputFiles[0].text;
}

async function measure(browser, contents, serverHtml) {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	try {
		await page.setContent('<!doctype html><html><body></body></html>');
		await page.evaluate(() => {
			globalThis.__keyWork = {};
		});
		await page.addScriptTag({ content: contents });
		const result = await page.evaluate(
			({ count, kinds, make, serverHtml }) => {
				const { runtime: rt, fixture } = keyBench;
				const makeRows = (0, eval)('(' + make + ')');
				const check = (condition, message) => {
					if (!condition) throw new Error(message);
				};
				const read = () => ({ ...globalThis.__keyWork });
				const reset = () => {
					globalThis.__keyWork = Object.fromEntries(
						[
							'flat_explicit',
							'flat_implicit',
							'path_json',
							'scalar_json',
							'nested_implicit',
							'tuple_json',
							'component_coercions',
						].map((name) => [name, 0]),
					);
				};
				const run = (root, component, props) => {
					rt.flushSync(() => root.render(component, props));
				};
				const results = {};
				for (const kind of kinds) {
					const stringify = JSON.stringify;
					if (kind === 'custom-json-explicit')
						JSON.stringify = function (...args) {
							return Reflect.apply(stringify, this, args);
						};
					const container = document.createElement('div');
					document.body.appendChild(container);
					const root = rt.createRoot(container);
					const prepared = [
						makeRows(rt.createElement, kind, count),
						makeRows(rt.createElement, kind, count),
					];
					run(root, fixture.Rows, { rows: prepared[0], version: 0 });
					const before = Array.from(container.querySelectorAll('li'));
					check(
						before.length === count + 1 + Number(!kind.startsWith('flat')),
						kind + ': row count',
					);
					const initial = container.innerHTML;
					const input = before[0].querySelector('input');
					input.value = 'typed value';
					input.focus();
					reset();
					run(root, fixture.Rows, { rows: prepared[1], version: 1 });
					const work = read();
					check(
						before.every((node, i) => node === container.querySelectorAll('li')[i]),
						kind + ': stable survivor identity',
					);
					check(
						input.value === 'typed value' && document.activeElement === input,
						kind + ': input/focus',
					);
					if (kind.includes('explicit')) {
						run(root, fixture.Rows, {
							rows: makeRows(rt.createElement, kind, count, true),
							version: 2,
						});
						const expected = kind.startsWith('flat')
							? before.slice().reverse()
							: [...before.slice(0, -1).reverse(), before.at(-1)];
						check(
							expected.every((node, i) => node === container.querySelectorAll('li')[i]),
							kind + ': reordered identity/order',
						);
					}
					run(root, fixture.Rows, { rows: prepared[0], version: 0 });
					check(container.innerHTML === initial, kind + ': full HTML');
					check(input.value === 'typed value', kind + ': input survives restore');
					results[kind] = { work, html: initial, rows: before.length };
					root.unmount();
					container.remove();
					JSON.stringify = stringify;

					const hydrationContainer = document.createElement('div');
					hydrationContainer.innerHTML = serverHtml[kind];
					document.body.appendChild(hydrationContainer);
					const adopted = Array.from(hydrationContainer.querySelectorAll('li'));
					const typed = adopted[0].querySelector('input');
					typed.value = 'before hydration';
					typed.focus();
					const hydrated = rt.hydrateRoot(
						hydrationContainer,
						rt.createElement(fixture.Rows, { rows: prepared[0], version: 0 }),
					);
					rt.flushSync(() => {});
					check(
						adopted.every((node, i) => node === hydrationContainer.querySelectorAll('li')[i]),
						kind + ': hydration adoption',
					);
					check(
						typed.value === 'before hydration' && document.activeElement === typed,
						kind + ': hydration input/focus',
					);
					hydrated.unmount();
					hydrationContainer.remove();
				}
				// One existing component keyed with 0 then "0" retains state. An object key
				// must coerce again on each render, with the + operator's default hint.
				const holder = document.createElement('div');
				document.body.appendChild(holder);
				let root = rt.createRoot(holder);
				run(root, fixture.Slot, { id: 0, label: 'first' });
				let input = holder.querySelector('input');
				input.value = 'typed component';
				input.focus();
				reset();
				run(root, fixture.Slot, { id: '0', label: 'second' });
				const primitive = read();
				check(
					holder.querySelector('input') === input && input.value === 'typed component',
					'numeric/string component-key equality',
				);
				let current = 'object-a';
				const hints = [];
				const key = {
					[Symbol.toPrimitive](hint) {
						hints.push(hint);
						return current;
					},
				};
				run(root, fixture.Slot, { id: key, label: 'object initial' });
				input = holder.querySelector('input');
				input.value = 'object typed';
				reset();
				run(root, fixture.Slot, { id: key, label: 'object same' });
				const object = read();
				check(
					holder.querySelector('input') === input && input.value === 'object typed',
					'object key stable value',
				);
				current = 'object-b';
				run(root, fixture.Slot, { id: key, label: 'object changed' });
				check(
					holder.querySelector('input') !== input &&
						holder.querySelector('input').value === 'object changed',
					'mutable object key remount',
				);
				check(
					hints.length >= 3 && hints.every((hint) => hint === 'default'),
					'component-key coercion hint',
				);
				let threw = false;
				try {
					rt.createElement('i', { key: Symbol('key') });
				} catch (error) {
					threw = error instanceof TypeError;
				}
				check(threw, 'symbol descriptor key preserves TypeError');
				root.unmount();
				holder.remove();
				results.component = { primitive, object, hints };
				return results;
			},
			{ count, kinds, make: makeRows.toString(), serverHtml },
		);
		assert.deepEqual(errors, []);
		return result;
	} finally {
		await page.close();
	}
}

let browser;
try {
	const serverCode = await bundle('server');
	const serverPath = path.join(temp, 'server.mjs');
	fs.writeFileSync(serverPath, serverCode);
	const server = await import(pathToFileURL(serverPath));
	const serverHtml = Object.fromEntries(
		kinds.map((kind) => [
			kind,
			server.runtime.renderToString(server.fixture.Rows, {
				rows: makeRows(server.runtime.createElement, kind, count),
				version: 0,
			}).html,
		]),
	);
	const clean = await bundle('client');
	const observed = await bundle('client', true);
	browser = await chromium.launch({ headless: true });
	const cleanResult = await measure(browser, clean, serverHtml);
	const observedResult = await measure(browser, observed, serverHtml);
	const targets = [];
	for (const kind of kinds) {
		assert.equal(
			cleanResult[kind].html,
			observedResult[kind].html,
			kind + ': observer preserves HTML',
		);
		targets.push({
			name: 'keys-' + kind,
			ops: Object.fromEntries(
				Object.entries(observedResult[kind].work).map(([name, value]) => [name, stat(value)]),
			),
			controls: {
				rows: cleanResult[kind].rows,
				html_sha256: hash(cleanResult[kind].html),
				hydration: true,
				survivor_identity: true,
			},
		});
	}
	for (const kind of ['primitive', 'object'])
		targets.push({
			name: 'keys-component-' + kind,
			ops: Object.fromEntries(
				Object.entries(observedResult.component[kind]).map(([name, value]) => [name, stat(value)]),
			),
			controls: {
				numeric_string_identity: true,
				mutable_object_remount: true,
				symbol_rejected: true,
				default_hint: true,
			},
		});
	// A positive unit reference lets the ratio runner enforce zero-work ceilings.
	targets.push({
		name: 'keys-work-budget',
		ops: Object.fromEntries(
			Object.keys(observedResult.component.primitive).map((name) => [name, stat(1)]),
		),
		controls: { unit_reference: true },
	});
	const payload = {
		suite: 'client-hot-paths',
		iterations: 1,
		targets,
		evidence: {
			source_sha256: hash(source),
			clean_bundle_sha256: hash(clean),
			observed_bundle_sha256: hash(observed),
			clean_bytes: Buffer.byteLength(clean),
			browser: browser.version(),
			node: process.version,
			platform: `${process.platform}/${process.arch}`,
		},
	};
	console.log(JSON.stringify(payload, null, 2));
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
} finally {
	await browser?.close();
	fs.rmSync(temp, { recursive: true, force: true });
}
