// Source-work observations and untouched production timings are separate runs.
// Counts describe executed allocation expressions, not engine allocations/heap.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { build, transformSync } from 'esbuild';
import { chromium } from 'playwright';
import ts from 'typescript';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => {
	const i = args.indexOf(key);
	return i === -1 ? fallback : args[i + 1];
};
const runtimeRoot = path.resolve(
	option('--runtime-root', path.resolve(import.meta.dirname, '../../packages/octane')),
);
const timing = args.includes('--timing');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-spread-'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const functions = new Set([
	'snapshotSpread',
	'normalizedHostProp',
	'setHostPropSources',
	'setSpread',
	'eventSlot',
	'ssrAttrs',
]);

function instrument(source) {
	const ast = ts.createSourceFile('runtime.js', source, ts.ScriptTarget.Latest, true);
	const changes = [];
	const sites = {};
	function visit(node, owner) {
		if (ts.isFunctionDeclaration(node) && functions.has(node.name?.text)) owner = node.name.text;
		if (owner) {
			let kind;
			if (ts.isArrayLiteralExpression(node)) kind = 'array';
			else if (ts.isObjectLiteralExpression(node)) kind = 'record';
			else if (ts.isNewExpression(node) && node.expression.getText(ast) === 'Map') kind = 'map';
			else if (
				ts.isCallExpression(node) &&
				['Object.create', 'Object.keys', 'Reflect.ownKeys'].includes(node.expression.getText(ast))
			)
				kind = node.expression.getText(ast);
			if (kind) {
				const label = owner + ':' + kind;
				sites[label] = (sites[label] ?? 0) + 1;
				changes.push(
					[node.getStart(ast), `(__spreadCount(${JSON.stringify(label)}), `],
					[node.end, ')'],
				);
			}
		}
		ts.forEachChild(node, (child) => visit(child, owner));
	}
	visit(ast, null);
	for (const [position, value] of changes.sort((a, b) => b[0] - a[0]))
		source = source.slice(0, position) + value + source.slice(position);
	return {
		source:
			'globalThis.__spreadWork = {}; function __spreadCount(k) { const w = globalThis.__spreadWork; w[k] = (w[k] || 0) + 1; }\n' +
			source,
		sites,
	};
}

// This is the compiler runtime boundary: authored spreads are snapshotted,
// source rows are resolved, and the prior complete snapshot is retained.
function clientExercise(rt, timed) {
	const check = (ok, message) => {
		if (!ok) throw new Error(message);
	};
	const results = {};
	for (const size of [4, 15, 50]) {
		for (const mode of ['canonical', 'aliases', 'stable-events', 'changed-events']) {
			const parent = document.createElement('div');
			document.body.appendChild(parent);
			const root = rt.createRoot(parent);
			let el, scope, prev;
			root.render((props, s) => {
				scope = s;
				el = rt.hostComponent(s, 0, 'button', null);
			});
			let clicks = 0;
			const handler = () => {
				clicks++;
			};
			const alternate = () => {
				clicks += 2;
			};
			const raw = {};
			for (let i = 0; i < size; i++) raw['data-p' + i] = String(i);
			if (mode === 'aliases') {
				raw.className = 'first';
				raw.class = 'last';
				raw.tabIndex = 0;
			}
			if (mode.endsWith('events')) {
				raw.onClick = handler;
				raw.onClickCapture = handler;
			}
			function update(i) {
				raw['data-p0'] = String(i & 1);
				if (mode === 'changed-events') raw.onClick = i & 1 ? alternate : handler;
				const sources = [
					[true, rt.snapshotSpread(raw)],
					[false, 'title', 'fixed'],
				];
				prev = rt.setHostPropSources(el, sources, prev, scope);
			}
			update(0);
			const live = parent.firstElementChild;
			const iterations = timed ? 3000 : 12;
			const samplesMs = [];
			if (timed) for (let i = 0; i < 1000; i++) update(i);
			globalThis.__spreadWork = {};
			for (let sample = 0; sample < (timed ? 7 : 1); sample++) {
				const start = performance.now();
				for (let i = 0; i < iterations; i++) update(i);
				samplesMs.push(performance.now() - start);
			}
			const work = { ...globalThis.__spreadWork };
			check(parent.firstElementChild === live, 'Host identity changed');
			check(el.title === 'fixed' && el.getAttribute('data-p0') === '1', 'Spread values missing');
			check(
				el.getAttribute('data-p' + (size - 1)) === String(size - 1),
				'Last spread prop missing',
			);
			if (mode === 'aliases')
				check(el.className === 'last' && el.tabIndex === 0, 'Alias winner changed');
			if (mode.endsWith('events')) {
				el.click();
				check(
					clicks === (mode === 'changed-events' ? 3 : 2),
					'Handler phase/latest closure changed',
				);
				prev = rt.setHostPropSources(el, [[true, rt.snapshotSpread({})]], prev, scope);
				el.click();
				check(clicks === (mode === 'changed-events' ? 3 : 2), 'Removed handlers still fire');
			}
			root.unmount();
			check(parent.childNodes.length === 0, 'Unmount left host');
			parent.remove();
			results[`${mode}_${size}`] = timed
				? { iterations, samplesMs, medianMs: [...samplesMs].sort((a, b) => a - b)[3] }
				: { iterations, work };
		}
	}
	return results;
}

function serverExercise(rt, timed) {
	const results = {};
	for (const size of [4, 15, 50]) {
		for (const mode of ['canonical', 'aliases']) {
			const raw = {};
			for (let i = 0; i < size; i++) raw['data-p' + i] = String(i);
			if (mode === 'aliases') {
				raw.className = 'first';
				raw.class = 'last';
				raw.tabIndex = 0;
			}
			const sources = [
				[true, raw],
				[false, 'title', 'fixed'],
			];
			let html;
			const iterations = timed ? 10000 : 12;
			const samplesMs = [];
			if (timed) for (let i = 0; i < 2000; i++) rt.ssrAttrs(sources, 'button');
			globalThis.__spreadWork = {};
			for (let sample = 0; sample < (timed ? 7 : 1); sample++) {
				const start = performance.now();
				for (let i = 0; i < iterations; i++) html = rt.ssrAttrs(sources, 'button');
				samplesMs.push(performance.now() - start);
			}
			assert(html.includes(' title="fixed"') && html.includes(` data-p${size - 1}="${size - 1}"`));
			if (mode === 'aliases') assert(html.includes(' class="last"') && !html.includes('first'));
			results[`${mode}_${size}`] = timed
				? { iterations, samplesMs, medianMs: [...samplesMs].sort((a, b) => a - b)[3] }
				: { iterations, work: globalThis.__spreadWork };
		}
	}
	return results;
}

let browser;
try {
	const bundles = {};
	for (const [name, platform] of [
		['runtime', 'browser'],
		['runtime.server', 'node'],
	]) {
		const result = await build({
			entryPoints: [path.join(runtimeRoot, 'src', name + '.ts')],
			bundle: true,
			write: false,
			format: 'esm',
			platform,
			target: 'esnext',
			minify: false,
			define: { 'process.env.NODE_ENV': '"production"' },
		});
		const original = result.outputFiles[0].text;
		const observed = timing ? { source: original, sites: {} } : instrument(original);
		bundles[name] = { ...observed, sha256: sha256(original), bytes: Buffer.byteLength(original) };
	}
	const serverFile = path.join(temporary, 'server.mjs');
	fs.writeFileSync(serverFile, bundles['runtime.server'].source);
	const server = await import(pathToFileURL(serverFile).href);
	const ssr = serverExercise(server, timing);
	const iife = transformSync(bundles.runtime.source, {
		format: 'iife',
		globalName: '__rt',
		target: 'esnext',
	}).code;
	browser = await chromium.launch({
		headless: true,
		...(option('--chromium') ? { executablePath: option('--chromium') } : {}),
		args: [
			'--no-sandbox',
			'--disable-background-networking',
			...(timing ? [] : ['--js-flags=--jitless']),
		],
	});
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(String(error)));
	await page.setContent('<!doctype html><body></body>');
	await page.addScriptTag({ content: iife });
	const client = await page.evaluate(`(${clientExercise.toString()})(__rt, ${timing})`);
	assert.deepEqual(errors, []);
	const targets = [];
	if (!timing) {
		for (const [surface, cases] of Object.entries({ client, ssr })) {
			for (const [name, entry] of Object.entries(cases)) {
				const split = name.lastIndexOf('_');
				const size = Number(name.slice(split + 1));
				const mode = name.slice(0, split);
				const actual = Object.values(entry.work).reduce((sum, n) => sum + n, 0);
				// Explicit source-work ceilings, not theoretical engine allocation floors.
				// Client keeps raw records, two Maps, snapshots and own-key scans;
				// aliases need a sort array, changed event props still parse metadata.
				const perUpdate =
					surface === 'client'
						? size + { canonical: 9, aliases: 13, 'stable-events': 11, 'changed-events': 12 }[mode]
						: size + (mode === 'canonical' ? 3 : 8);
				const budget = perUpdate * entry.iterations;
				const stat = (n) => ({
					source_expressions: deterministicStatForJson(deterministicCount(n)),
				});
				targets.push({ name: `${surface}-${name}`, ops: stat(actual) });
				targets.push({ name: `${surface}-${name}-budget`, ops: stat(budget) });
				const maps = entry.work[surface === 'client' ? 'setHostPropSources:map' : 'ssrAttrs:map'];
				assert(maps >= entry.iterations, 'Every measured update resolved its prop sources');
				if (!args.includes('--measure'))
					assert(
						actual <= budget,
						`${surface}/${name}: source-work budget exceeded (${actual} > ${budget})`,
					);
			}
		}
	}
	const report = {
		suite: 'spread-hosts',
		iterations: 1,
		targets,
		mode: timing ? 'untouched-production-timing' : 'instrumented-source-work',
		node: process.version,
		platform: process.platform,
		architecture: process.arch,
		v8: process.versions.v8,
		browser: browser.version(),
		runtimeRoot,
		bundles: Object.fromEntries(
			Object.entries(bundles).map(([k, v]) => [
				k,
				{ sha256: v.sha256, bytes: v.bytes, sites: v.sites },
			]),
		),
		client,
		ssr,
	};
	const json = JSON.stringify(report, null, 2) + '\n';
	if (option('--output', process.env.BENCH_JSON))
		fs.writeFileSync(option('--output', process.env.BENCH_JSON), json);
	process.stdout.write(json);
} finally {
	await browser?.close();
	fs.rmSync(temporary, { recursive: true, force: true });
}
