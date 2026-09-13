// Browser semantics and deterministic source-work counts. Clean bundles are
// never instrumented for size; observed bundles are never used for timing.
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
	process.env.CHILDREN_RUNTIME || process.argv[2] || runtime,
	'utf8',
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const val = (score) => ({ score, median: score, min: score, samples: 1 });
const counter = (name) =>
	b.update('++', b.member(b.member(b.id('globalThis'), '__childrenWork'), name));
const observedFunctions = new Set([
	'reconcileDeoptChildren',
	'liveOwnedChildAt',
	'nextDeoptOwnedChild',
	'nodeAfterPortalRange',
]);

const built = await build({
	stdin: {
		contents: `export { createRoot, createElement, createPortal, flushSync } from 'octane';`,
		resolveDir: repo,
	},
	bundle: true,
	write: false,
	format: 'iife',
	globalName: 'descriptorChildren',
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
const clean = built.outputFiles[0].text;
const minified = transformSync(clean, { minify: true, target: 'es2022' }).code;
let sites = { live_indexes: 0, sibling_reads: 0 };
function instrument(node, active = false) {
	if (Array.isArray(node)) return node.map((item) => instrument(item, active));
	if (node === null || typeof node !== 'object' || typeof node.type !== 'string') return node;
	if (node.type === 'FunctionDeclaration') active = observedFunctions.has(node.id?.name);
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
	if (!active) return rewritten;
	if (node.type === 'CallExpression' && node.callee?.name === 'getNextSibling') {
		sites.sibling_reads++;
		return b.sequence([counter('sibling_reads'), rewritten]);
	}
	if (node.type === 'MemberExpression' && node.computed && node.object?.name === 'existing') {
		sites.live_indexes++;
		return b.sequence([counter('live_indexes'), rewritten]);
	}
	return rewritten;
}
const observed = print(instrument(parseModule(clean, 'children-clean.js')), language()).code;
assert.ok(sites.sibling_reads > 0, 'sibling observer found no runtime calls');

const browser = await chromium.launch({ headless: true });
const targets = [];
const metadata = {
	node: process.version,
	chromium: browser.version(),
	runtimeSha256: hash(runtimeSource),
	runnerSha256: hash(fs.readFileSync(import.meta.filename)),
	observationSites: sites,
	measurement: 'reached live-list indexes and sibling getter calls; no duration or heap claim',
	bundle_minified: Buffer.byteLength(minified),
	bundle_gzip: gzipSync(minified, { level: 9 }).length,
	legacyFocusMovement: process.env.CHILDREN_LEGACY_MOVE === '1',
};
try {
	for (const count of [128, 512]) {
		for (const foreign of [false, true]) {
			let baseline;
			for (const observe of [false, true]) {
				const page = await browser.newPage();
				await page.addScriptTag({ content: observe ? observed : clean });
				const result = await page.evaluate(
					({ count, foreign, legacyFocusMovement }) => {
						const { createRoot, createElement, createPortal, flushSync } =
							globalThis.descriptorChildren;
						globalThis.__childrenWork = { live_indexes: 0, sibling_reads: 0 };
						const container = document.createElement('div');
						document.body.append(container);
						const picks = [];
						function App({ items }) {
							return createElement(
								'section',
								{ 'data-list': '' },
								items.map((id) =>
									createElement(
										'div',
										{ key: id, 'data-row': id },
										createElement('input', { defaultValue: 'row:' + id }),
										createElement('button', { onClick: () => picks.push(id) }, 'row:' + id),
									),
								),
							);
						}
						let ids = Array.from({ length: count }, (_, id) => id);
						const root = createRoot(container);
						root.render(App, { items: ids });
						const list = container.querySelector('[data-list]');
						if (legacyFocusMovement)
							Object.defineProperty(list, 'moveBefore', { value: undefined });
						const rows = new Map(
							Array.from(list.querySelectorAll('[data-row]'), (row) => [
								Number(row.dataset.row),
								row,
							]),
						);
						const input = rows.get(0).querySelector('input');
						input.value = 'typed draft';
						input.focus();
						input.setSelectionRange(2, 7, 'backward');
						let portalRoot;
						let foreignNode;
						let portalNode;
						if (foreign) {
							foreignNode = document.createElement('em');
							foreignNode.textContent = 'foreign';
							list.insertBefore(foreignNode, rows.get(count >> 1));
							const portalContainer = document.createElement('div');
							document.body.append(portalContainer);
							portalRoot = createRoot(portalContainer);
							portalRoot.render(() =>
								createPortal(createElement('aside', { 'data-portal': '' }, 'portal'), list),
							);
							portalNode = list.querySelector('[data-portal]');
						}
						const operations = {};
						function update(name, next) {
							globalThis.__childrenWork = { live_indexes: 0, sibling_reads: 0 };
							flushSync(() => root.render(App, { items: next }));
							operations[name] = { ...globalThis.__childrenWork };
							const actual = Array.from(list.querySelectorAll('[data-row]'), (row) =>
								Number(row.dataset.row),
							);
							if (JSON.stringify(actual) !== JSON.stringify(next))
								throw new Error('owned order changed: ' + name);
							for (const id of next) {
								const row = list.querySelector('[data-row="' + id + '"]');
								if (rows.has(id) && row !== rows.get(id))
									throw new Error('row identity lost: ' + name);
								if (row.querySelector('button').textContent !== 'row:' + id)
									throw new Error('row text wrong');
							}
							if (
								input.value !== 'typed draft' ||
								document.activeElement !== input ||
								input.selectionStart !== 2 ||
								input.selectionEnd !== 7 ||
								input.selectionDirection !== 'backward'
							)
								throw new Error('focused selection lost: ' + name);
							if (
								foreign &&
								(foreignNode.parentNode !== list ||
									list.querySelector('[data-portal]') !== portalNode ||
									portalNode.textContent !== 'portal')
							)
								throw new Error('foreign children lost');
							ids = next;
						}
						update('unchanged', ids);
						update('reverse', [...ids].reverse());
						update('rotate', [...ids.slice(1), ids[0]]);
						update('replace', [count + 1, ...ids.filter((id) => id % 2 === 0), count + 2]);
						flushSync(() => rows.get(0).querySelector('button').click());
						if (JSON.stringify(picks) !== '[0]') throw new Error('native event lost');
						const snapshot = {
							ids,
							input: input.value,
							picks,
							foreign: foreignNode?.textContent,
							portal: portalNode?.textContent,
						};
						portalRoot?.unmount();
						root.unmount();
						if (container.innerHTML !== '') throw new Error('teardown left DOM');
						return { operations, snapshot };
					},
					{ count, foreign, legacyFocusMovement: metadata.legacyFocusMovement },
				);
				if (!observe) baseline = result.snapshot;
				else {
					assert.deepEqual(result.snapshot, baseline, 'observation changed browser semantics');
					for (const [name, work] of Object.entries(result.operations)) {
						targets.push({
							name: `children-${count}-${foreign ? 'foreign' : 'owned'}-${name}`,
							ops: Object.fromEntries(
								Object.entries(work).map(([key, value]) => [key, val(value)]),
							),
							meta: { ...metadata, snapshot: result.snapshot, count, foreign },
						});
					}
					targets.push({
						name: `children-${count}-reference`,
						ops: { live_indexes: val(count), sibling_reads: val(count) },
					});
				}
				await page.close();
			}
		}
	}
	const unique = [...new Map(targets.map((target) => [target.name, target])).values()];
	const result = { suite: 'descriptor-renderer', iterations: 1, targets: unique, meta: metadata };
	console.log(
		JSON.stringify({ metadata, targets: unique.map(({ name, ops }) => ({ name, ops })) }, null, 2),
	);
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, '\t') + '\n');
} finally {
	await browser.close();
}
