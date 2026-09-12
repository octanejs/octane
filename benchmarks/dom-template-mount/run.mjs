// Production client mount work gate for compiled fragment and text bindings.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = import.meta.dirname;
const SOURCE = path.resolve(process.env.OCTANE_DOM_SOURCE_ROOT || path.join(HERE, '../..'));
const DEPS = path.resolve(process.env.OCTANE_DOM_DEPS_ROOT || path.join(HERE, '../..'));
const PACKAGE = path.join(SOURCE, 'packages/octane');
const requireDeps = createRequire(path.join(DEPS, 'packages/octane/package.json'));
const { build, transformSync, version: esbuildVersion } = requireDeps('esbuild');
const { Window } = await import(pathToFileURL(requireDeps.resolve('happy-dom')).href);
const { compile } = await import(pathToFileURL(path.join(PACKAGE, 'src/compiler/index.js')).href);
const exportsMap = JSON.parse(fs.readFileSync(path.join(PACKAGE, 'package.json'), 'utf8')).exports;
const fixtureFile = path.join(HERE, 'cases.tsrx');
const fixture = fs.readFileSync(fixtureFile, 'utf8');
const rows = Array.from({ length: 256 }, (_, id) => ({
	id,
	label: `label-${id}`,
	prefix: `left-${id}`,
	suffix: `right-${id}`,
}));
const sha = (text) => createHash('sha256').update(text).digest('hex');
const stat = (score) => ({ score, median: score, min: score, samples: 1 });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-dom-template-mount-'));

async function bundleFixture() {
	const compiled = compile(fixture, fixtureFile, {
		mode: 'client',
		dev: false,
		hmr: false,
	});
	assert.deepEqual(compiled.diagnostics, [], 'fixture compiler diagnostics');
	const built = await build({
		entryPoints: [path.join(HERE, 'entry.mjs')],
		outfile: path.join(temp, 'entry.mjs'),
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [path.join(DEPS, 'packages/octane/node_modules'), path.join(DEPS, 'node_modules')],
		plugins: [
			{
				name: 'dom-template-mount',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const entry = exportsMap[request === 'octane' ? '.' : './' + request.slice(7)];
						const target = typeof entry === 'string' ? entry : entry?.import || entry?.default;
						assert.equal(typeof target, 'string', `public runtime export ${request}`);
						return { path: path.resolve(PACKAGE, target) };
					});
					plugin.onLoad({ filter: /\.tsrx$/ }, ({ path: filename }) => {
						assert.equal(filename, fixtureFile, 'unexpected fixture module');
						return { contents: compiled.code, loader: 'js', resolveDir: HERE };
					});
				},
			},
		],
	});
	const output = built.outputFiles[0].text;
	fs.writeFileSync(path.join(temp, 'entry.mjs'), output);
	if (process.env.BENCH_BUNDLE_PATH) fs.writeFileSync(process.env.BENCH_BUNDLE_PATH, output);
	const minified = transformSync(compiled.code, { minify: true }).code;
	return {
		module: await import(pathToFileURL(path.join(temp, 'entry.mjs')).href),
		code: compiled.code,
		meta: {
			fixtureSha256: sha(fixture),
			entrySha256: sha(fs.readFileSync(path.join(HERE, 'entry.mjs'))),
			codeMinifiedBytes: Buffer.byteLength(minified),
			codeGzipBytes: gzipSync(minified).length,
			bundleBytes: Buffer.byteLength(output),
			bundleGzipBytes: gzipSync(output).length,
			esbuildVersion,
		},
	};
}

function setupDom() {
	const window = new Window({ url: 'http://localhost/' });
	for (const key of [
		'window',
		'document',
		'navigator',
		'Node',
		'Element',
		'HTMLElement',
		'SVGElement',
		'Text',
		'Comment',
		'DocumentFragment',
		'Event',
		'EventTarget',
		'MutationObserver',
		'HTMLInputElement',
		'HTMLSelectElement',
		'HTMLTextAreaElement',
		'getComputedStyle',
		'requestAnimationFrame',
		'cancelAnimationFrame',
	]) {
		const value = key === 'window' ? window : window[key];
		if (value !== undefined)
			Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
	}
	return window;
}

function observeDom() {
	const work = {
		insertBefore: 0,
		fragmentInsertBefore: 0,
		replaceChild: 0,
		appendChild: 0,
		labelTextCreates: 0,
	};
	const originalInsert = Node.prototype.insertBefore;
	const originalReplace = Node.prototype.replaceChild;
	const originalAppend = Node.prototype.appendChild;
	const originalText = document.createTextNode;
	// happy-dom implements some native operations by calling these methods
	// internally. Count only calls crossing in from the framework bundle.
	let depth = 0;
	Node.prototype.insertBefore = function (node, anchor) {
		if (depth === 0) {
			work.insertBefore++;
			if (node.nodeType === 11) work.fragmentInsertBefore++;
		}
		depth++;
		try {
			return originalInsert.call(this, node, anchor);
		} finally {
			depth--;
		}
	};
	Node.prototype.replaceChild = function (next, previous) {
		if (depth === 0) work.replaceChild++;
		depth++;
		try {
			return originalReplace.call(this, next, previous);
		} finally {
			depth--;
		}
	};
	Node.prototype.appendChild = function (node) {
		if (depth === 0) work.appendChild++;
		depth++;
		try {
			return originalAppend.call(this, node);
		} finally {
			depth--;
		}
	};
	document.createTextNode = function (text) {
		if (/^label-\d+$/.test(text)) work.labelTextCreates++;
		return originalText.call(this, text);
	};
	return {
		work,
		snapshot() {
			return { ...work };
		},
		reset() {
			for (const key of Object.keys(work)) work[key] = 0;
		},
		restore() {
			Node.prototype.insertBefore = originalInsert;
			Node.prototype.replaceChild = originalReplace;
			Node.prototype.appendChild = originalAppend;
			document.createTextNode = originalText;
		},
	};
}

function verify(container, currentRows, previous = new Map()) {
	const children = [...container.querySelector('#rows').children];
	assert.equal(children.length, currentRows.length * 3, 'all physical fragment roots');
	const next = new Map();
	for (let index = 0; index < currentRows.length; index++) {
		const row = currentRows[index];
		const nodes = children.slice(index * 3, index * 3 + 3);
		assert.deepEqual(
			nodes.map((node) => node.localName),
			['label', 'input', 'span'],
		);
		assert.equal(nodes[0].textContent, row.label);
		assert.equal(nodes[0].firstChild?.nodeType, 3);
		assert.equal(nodes[0].childNodes.length, 1, 'single text node, even for empty text');
		assert.equal(nodes[1].getAttribute('data-input'), String(row.id));
		assert.equal(nodes[2].textContent, `${row.prefix}:${row.suffix}`);
		assert.deepEqual(
			[...nodes[2].childNodes].map((node) => node.nodeType),
			[3, 1, 3],
		);
		if (previous.has(row.id)) {
			const old = previous.get(row.id);
			for (let i = 0; i < 3; i++) assert.strictEqual(nodes[i], old[i], 'keyed survivor');
		}
		next.set(row.id, nodes);
	}
	return next;
}

function runWork(bundle) {
	const recorder = observeDom();
	try {
		const work = {};
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = bundle.createRoot(container);
		recorder.reset();
		root.render(bundle.FragmentRows, { rows, tick: 'start' });
		work.mount = recorder.snapshot();
		let survivor = verify(container, rows);
		const focused = survivor.get(4)[1];
		focused.value = 'typed';
		focused.focus();
		recorder.reset();
		bundle.flushSync(() => root.render(bundle.FragmentRows, { rows, tick: 'changed' }));
		work.unrelatedUpdate = recorder.snapshot();
		assert.equal(container.querySelector('output')?.textContent, 'changed');
		survivor = verify(container, rows, survivor);
		const reversed = [...rows].reverse();
		recorder.reset();
		bundle.flushSync(() => root.render(bundle.FragmentRows, { rows: reversed, tick: 'reverse' }));
		work.reorder = recorder.snapshot();
		survivor = verify(container, reversed, survivor);
		assert.strictEqual(survivor.get(4)[1], focused);
		assert.equal(focused.value, 'typed');
		assert.strictEqual(document.activeElement, focused);
		const empty = { ...rows[7], label: '' };
		const smaller = [empty, ...rows.slice(0, 7)];
		bundle.flushSync(() => root.render(bundle.FragmentRows, { rows: smaller, tick: 'smaller' }));
		verify(container, smaller, survivor);
		assert.equal(container.querySelector('#rows > label')?.textContent, '');
		root.unmount();
		assert.equal(container.childNodes.length, 0);
		container.remove();

		// Flat control uses identical keyed row count, but no multi-root drain.
		const flat = document.createElement('div');
		document.body.appendChild(flat);
		const control = bundle.createRoot(flat);
		recorder.reset();
		control.render(bundle.FlatRows, { rows, tick: 'flat' });
		work.flatMount = recorder.snapshot();
		assert.deepEqual(
			[...flat.querySelectorAll('#rows > p')].map((p) => p.textContent),
			rows.map((r) => r.label),
		);
		control.unmount();
		flat.remove();

		const foreign = document.createElement('div');
		document.body.appendChild(foreign);
		const other = bundle.createRoot(foreign);
		other.render(bundle.ForeignSvg, { label: 'C' });
		assert.equal(foreign.querySelector('svg text')?.textContent, 'C');
		assert.equal(foreign.querySelector('svg circle')?.namespaceURI, 'http://www.w3.org/2000/svg');
		other.unmount();
		const math = bundle.createRoot(foreign);
		math.render(bundle.ForeignMath, { label: 'C' });
		assert.equal(foreign.querySelector('math')?.textContent, 'C+');
		math.unmount();
		foreign.remove();
		return {
			work,
			semantics: sha(
				JSON.stringify({
					rows: rows.map((r) => [r.id, r.label, r.prefix, r.suffix]),
					empty: empty.label,
					focused: 'typed',
					foreign: 'C',
				}),
			),
		};
	} finally {
		recorder.restore();
	}
}

let result;
try {
	setupDom();
	const { module, code, meta } = await bundleFixture();
	result = {
		suite: 'dom-template-mount',
		iterations: 1,
		meta,
		...runWork(module),
		// A helper call exists only for multi-root bodies, including the flat-root
		// parent's nested keyed row body. This is an output-shape diagnostic, not
		// a behavior assertion.
		compiled: {
			drainFragCalls: [...code.matchAll(/_\$drainFrag\(/g)].length,
			htextCalls: [...code.matchAll(/_\$htext\(/g)].length,
			htextSwapCalls: [...code.matchAll(/_\$htextSwap\(/g)].length,
		},
	};
	const target = (name, counts) => ({
		name,
		ops: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, stat(value)])),
		meta: { fixtureSha256: meta.fixtureSha256, semantics: result.semantics },
	});
	result.targets = [
		target('fragment-256', result.work.mount),
		target('flat-256', result.work.flatMount),
		target('unrelated-update', result.work.unrelatedUpdate),
		target('reorder', result.work.reorder),
		target('work-model', {
			insertBefore: 770,
			fragmentInsertBefore: 256,
			replaceChild: 512,
			appendChild: 4,
			labelTextCreates: 1,
		}),
		target('flat-work-model', { insertBefore: 258 }),
		target('reorder-work-model', { insertBefore: 1294 }),
	];
	console.log(`PASS dom-template-mount: ${JSON.stringify(result.work)}`);
} finally {
	fs.rmSync(temp, { recursive: true, force: true });
}

if (process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(result, null, '\t')}\n`);
