// Optional production-bundle profile. The hook-memo ratio suite stays untimed;
// this separate entry records actual Block/Scope/cache backing and noisy public
// root timings against frozen and candidate bundles in fresh processes.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getHeapSnapshot } from 'node:v8';
import { Window } from 'happy-dom';

const [mode, ...args] = process.argv.slice(2);
if (mode === 'timing') {
	const [base, candidate, output] = args;
	assert.ok(base && candidate, 'Pass baseline and candidate production bundles.');
	const samples = { base: [], candidate: [] };
	for (let round = 0; round < 6; round++) {
		for (const [name, bundle] of round % 2 === 0
			? [
					['base', base],
					['candidate', candidate],
				]
			: [
					['candidate', candidate],
					['base', base],
				]) {
			const child = spawnSync(
				process.execPath,
				[fileURLToPath(import.meta.url), 'sample', bundle],
				{
					encoding: 'utf8',
				},
			);
			if (child.status !== 0) throw new Error(child.stderr || child.stdout);
			samples[name].push(JSON.parse(child.stdout.trim()));
		}
	}
	const report = {
		node: process.version,
		v8: process.versions.v8,
		metric:
			'Microseconds per public createRoot+render+unmount or root.render update in happy-dom; host-bound and ungated.',
		bundleSha256: Object.fromEntries(
			Object.entries({ base, candidate }).map(([name, filename]) => [
				name,
				createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),
			]),
		),
		samples,
	};
	if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report, null, 2));
	process.exit(0);
}

const bundlePath = args[0];
assert.ok(bundlePath, 'Pass an absolute production cache-shape bundle.');
if (
	mode === 'memory' &&
	(!process.execArgv.includes('--allow-natives-syntax') ||
		!process.execArgv.includes('--expose-gc'))
) {
	const child = spawnSync(
		process.execPath,
		[
			'--allow-natives-syntax',
			'--expose-gc',
			fileURLToPath(import.meta.url),
			...process.argv.slice(2),
		],
		{ stdio: 'inherit' },
	);
	process.exit(child.status ?? 1);
}
assert.ok(
	mode === 'memory' || mode === 'sample',
	'Use memory <bundle> or timing <base> <candidate>.',
);
const window = new Window({ url: 'http://localhost/' });
for (const name of [
	'window',
	'document',
	'navigator',
	'Node',
	'Element',
	'HTMLElement',
	'SVGElement',
	'Comment',
	'Text',
	'Event',
	'EventTarget',
	'MutationObserver',
	'HTMLInputElement',
	'HTMLSelectElement',
	'HTMLTextAreaElement',
	'requestAnimationFrame',
	'cancelAnimationFrame',
]) {
	const value = name === 'window' ? window : window[name];
	if (value !== undefined)
		Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
const bundle = await import(pathToFileURL(path.resolve(bundlePath)).href);

function mount(body, props, observe) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = bundle.createRoot(container);
	function Capture(properties, scope) {
		if (observe) observe(scope);
		body(properties, scope);
	}
	bundle.flushSync(() => root.render(Capture, props));
	return {
		container,
		root,
		Capture,
		unmount() {
			root.unmount();
			container.remove();
		},
	};
}

if (mode === 'sample') {
	const result = {};
	for (const name of ['Flat', 'Combined']) {
		const body = bundle[name];
		const mounted = (count) => {
			for (let index = 0; index < count; index++) {
				const instance = mount(body, { label: 'alpha', tick: index });
				assert.equal(instance.container.querySelector('#cache-label')?.textContent, 'alpha');
				instance.unmount();
			}
		};
		mounted(500);
		let start = performance.now();
		mounted(1500);
		result[`${name}_mount_us`] = ((performance.now() - start) * 1000) / 1500;
		const instance = mount(body, { label: 'alpha', tick: 0 });
		const input = instance.container.querySelector('input');
		input.value = 'retained';
		input.focus();
		const updated = (count, offset = 0) => {
			for (let index = offset; index < count + offset; index++) {
				const label = index % 4 === 0 ? 'beta' : 'alpha';
				bundle.flushSync(() => instance.root.render(instance.Capture, { label, tick: index }));
			}
		};
		updated(6000);
		start = performance.now();
		updated(20000, 6000);
		result[`${name}_update_us`] = ((performance.now() - start) * 1000) / 20000;
		assert.equal(instance.container.querySelector('input'), input);
		assert.equal(input.value, 'retained');
		assert.equal(document.activeElement, input);
		assert.equal(instance.container.querySelector('#cache-label')?.textContent, 'alpha');
		if (name === 'Flat')
			assert.equal(instance.container.querySelector('output')?.textContent, '25999');
		else
			assert.equal(
				instance.container.querySelector('#cache-host')?.getAttribute('data-tick'),
				'25999',
			);
		instance.unmount();
	}
	console.log(JSON.stringify(result));
} else {
	let combinedScope;
	const combined = mount(bundle.Combined, { label: 'alpha', tick: 0 }, (scope) => {
		combinedScope = scope;
	});
	let flatScope;
	const flat = mount(bundle.Flat, { label: 'alpha', tick: 0 }, (scope) => {
		flatScope = scope;
	});
	assert.equal(combined.container.querySelector('#cache-label')?.textContent, 'alpha');
	assert.equal(flat.container.querySelector('#cache-label')?.textContent, 'alpha');
	let childScope;
	const host = mount(
		() => {},
		{ label: 'alpha', tick: 0 },
		(scope) => {
			bundle.hostComponent(scope, 0, 'section', null);
			childScope = scope.slots[0].childScope;
		},
	);
	assert.ok(childScope, 'expected actual component lite Scope');
	const records = {
		combinedBlock: combinedScope,
		flatBlock: flatScope,
		liteScope: childScope,
		combinedSlots: combinedScope.slots,
		flatSlots: flatScope.slots,
		liteSlots: childScope.slots,
	};
	if (combinedScope.compilerMemo) {
		const region = combinedScope.compilerMemo;
		records.memoRegion = region;
		records.autoCells = Array.isArray(region) ? region[1] : region.auto;
		records.hookCells = Array.isArray(region) ? region[2] : region.hooks;
	} else {
		for (const [key, value] of Object.entries(combinedScope.slots)) {
			if (/^_m\$\d+$/.test(key)) records.autoCells = value;
			if (/^_k\$\d+$/.test(key)) records.hookCells = value;
		}
	}
	assert.ok(records.autoCells && records.hookCells, 'expected both compiler cache lanes');
	// Alternate container layouts reference the *same* real memo cell arrays.
	// Their direct bytes isolate the container's one-body storage cost.
	records.objectAlternative = {
		bodyId: 2,
		autoCells: records.autoCells,
		hookCells: records.hookCells,
		overflow: null,
	};
	records.dictionaryAlternative = Object.create(null);
	records.dictionaryAlternative['_m$2'] = records.autoCells;
	records.dictionaryAlternative['_k$2'] = records.hookCells;
	const mapEqual = new Function('a', 'b', 'return %HaveSameMap(a, b)');
	const fast = new Function('object', 'return %HasFastProperties(object)');
	const shapes = {
		blockMapsEqual: mapEqual(combinedScope, flatScope),
		fast: Object.fromEntries(Object.entries(records).map(([name, value]) => [name, fast(value)])),
		fields: Object.fromEntries(
			Object.entries(records).map(([name, value]) => [name, Object.keys(value)]),
		),
	};
	globalThis.__octaneCacheShapeRecords = records;
	globalThis.gc();
	const chunks = [];
	for await (const chunk of getHeapSnapshot()) chunks.push(chunk);
	const snapshot = JSON.parse(Buffer.concat(chunks).toString());
	const { nodes, edges, strings } = snapshot;
	const meta = snapshot.snapshot.meta;
	const width = meta.node_fields.length;
	const edgeWidth = meta.edge_fields.length;
	const countIndex = meta.node_fields.indexOf('edge_count');
	const sizeIndex = meta.node_fields.indexOf('self_size');
	const typeIndex = meta.edge_fields.indexOf('type');
	const nameIndex = meta.edge_fields.indexOf('name_or_index');
	const targetIndex = meta.edge_fields.indexOf('to_node');
	const propertyType = meta.edge_types[typeIndex].indexOf('property');
	const internalType = meta.edge_types[typeIndex].indexOf('internal');
	const offsets = new Map();
	let directory;
	for (let node = 0, edge = 0; node < nodes.length; node += width) {
		offsets.set(node, edge);
		for (let count = nodes[node + countIndex]; count > 0; count--, edge += edgeWidth) {
			if (
				edges[edge + typeIndex] === propertyType &&
				strings[edges[edge + nameIndex]] === '__octaneCacheShapeRecords'
			)
				directory = edges[edge + targetIndex];
		}
	}
	assert.notEqual(directory, undefined, 'memory record directory absent');
	const sizes = {};
	for (
		let edge = offsets.get(directory), count = nodes[directory + countIndex];
		count > 0;
		count--, edge += edgeWidth
	) {
		if (edges[edge + typeIndex] !== propertyType) continue;
		const name = strings[edges[edge + nameIndex]];
		if (!(name in records)) continue;
		const node = edges[edge + targetIndex];
		const own = nodes[node + sizeIndex];
		let properties = 0;
		let elements = 0;
		for (
			let child = offsets.get(node), remaining = nodes[node + countIndex];
			remaining > 0;
			remaining--, child += edgeWidth
		) {
			if (edges[child + typeIndex] !== internalType) continue;
			const backing = strings[edges[child + nameIndex]];
			if (backing === 'properties') properties = nodes[edges[child + targetIndex] + sizeIndex];
			if (backing === 'elements') elements = nodes[edges[child + targetIndex] + sizeIndex];
		}
		sizes[name] = { own, properties, elements, directBytes: own + properties + elements };
	}
	assert.equal(Object.keys(sizes).length, Object.keys(records).length);
	const report = { node: process.version, v8: process.versions.v8, shapes, sizes };
	if (args[1]) fs.writeFileSync(args[1], JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report, null, 2));
	delete globalThis.__octaneCacheShapeRecords;
	combined.unmount();
	flat.unmount();
	host.unmount();
}
await window.happyDOM.close();
