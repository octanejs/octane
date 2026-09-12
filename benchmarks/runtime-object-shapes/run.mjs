// Untimed production-runtime shape diagnostics. Private records are observed
// only here; public DOM, identity, ref and cleanup outcomes remain the controls.
process.env.NODE_ENV = 'production';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
import { inspectRecords } from './diagnostics.mjs';

const runtimePath = process.argv[2];
const observe = process.argv.includes('--observe');
if (!runtimePath) throw new Error('Pass an absolute bundled production runtime path.');
if (
	!process.execArgv.includes('--allow-natives-syntax') ||
	!process.execArgv.includes('--expose-gc')
) {
	const child = spawnSync(
		process.execPath,
		['--allow-natives-syntax', '--expose-gc', import.meta.filename, ...process.argv.slice(2)],
		{
			stdio: 'inherit',
			env: process.env,
		},
	);
	process.exit(child.status ?? 1);
}
const window = new Window({ url: 'http://localhost/' });
for (const name of [
	'document',
	'Node',
	'Element',
	'HTMLElement',
	'HTMLInputElement',
	'HTMLTextAreaElement',
	'Event',
	'MouseEvent',
	'MutationObserver',
	'SVGElement',
]) {
	Object.defineProperty(globalThis, name, { value: window[name], configurable: true });
}
Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
const runtime = await import(pathToFileURL(path.resolve(runtimePath)).href);
const {
	createRoot,
	createElement,
	flushSync,
	forBlock,
	keyedForBlock,
	mapSlot,
	hostComponent,
	scheduleRenderCleanup,
} = runtime;
const sameMap = new Function('a', 'b', 'return %HaveSameMap(a, b);');
const fast = new Function('a', 'return %HasFastProperties(a);');
const records = { hosts: [], lists: [], captures: [] };
const outcomes = [];
const rows = Array.from({ length: 8 }, (_, id) => ({ id, label: `row:${id}` }));
const key = (row) => row.id;
function rowBody(row, scope) {
	hostComponent(
		scope,
		0,
		'li',
		{ 'data-row': row.id },
		createElement('input', { defaultValue: row.label }),
	);
}

for (let iteration = 0; iteration < 12; iteration++) {
	for (const mode of ['ordinary', 'selection', 'mapped']) {
		const active = mode === 'selection';
		const container = document.createElement('div');
		document.body.append(container);
		const refs = [];
		let cleaned = 0;
		let observed;
		const refA = (node) => {
			if (node !== null) {
				refs.push('a');
				return () => refs.push('-a');
			}
		};
		const refB = (node) => {
			if (node !== null) {
				refs.push('b');
				return () => refs.push('-b');
			}
		};
		function Scene(props, scope) {
			const host = hostComponent(
				scope,
				0,
				'section',
				{ ref: props.version === 0 ? refA : refB, 'data-version': props.version },
				active ? () => createElement('span', null, `child:${props.version}`) : null,
			);
			const list = hostComponent(scope, 1, 'ul', null);
			if (mode === 'mapped') {
				mapSlot(
					scope,
					2,
					list,
					props.rows,
					Array.prototype.map,
					true,
					(row) => createElement('li', { key: row.id }, row.label),
					key,
					rowBody,
					0,
					[props.version],
				);
			} else if (active) {
				keyedForBlock(scope, 2, list, props.rows, key, rowBody, 0, [props.version]);
				scheduleRenderCleanup(
					(callback) => callback(),
					null,
					() => cleaned++,
				);
			} else forBlock(scope, 2, list, props.rows, key, rowBody);
			observed = {
				host: scope.slots[0],
				list: mode === 'mapped' ? scope.slots[2].forSlot : scope.slots[2],
				capture: scope.block.idState.renderOwner.transaction.capture,
			};
			assert.equal(host.parentNode, container);
		}
		const root = createRoot(container);
		let verified = false;
		try {
			root.render(Scene, { rows, version: 0 });
			flushSync(() => {});
			const section = container.querySelector('section');
			const inputs = [...container.querySelectorAll('input')];
			assert.equal(inputs.length, rows.length);
			for (const input of inputs) input.value = `typed:${input.value}`;
			const first = observed;
			flushSync(() => root.render(Scene, { rows: rows.toReversed(), version: 1 }));
			assert.equal(container.querySelector('section'), section);
			assert.equal(section.getAttribute('data-version'), '1');
			if (active) assert.equal(section.textContent, 'child:1');
			else assert.equal(section.textContent, '');
			const reordered = [...container.querySelectorAll('input')];
			for (let i = 0; i < inputs.length; i++) {
				assert.equal(reordered[i], inputs[inputs.length - i - 1]);
				assert.equal(reordered[i].value, `typed:row:${inputs.length - i - 1}`);
			}
			assert.deepEqual(refs, ['a', '-a', 'b']);
			assert.equal(cleaned, active ? 2 : 0);
			// Sample after warmup; each value is an actual record retained by its
			// rendered root, not a replica literal or a patched runtime allocation.
			if (iteration >= 4) {
				records.hosts.push(observed.host);
				records.lists.push(observed.list);
				records.captures.push(first.capture, observed.capture);
			}
			outcomes.push([mode, section.textContent, reordered.map((input) => input.value), cleaned]);
			verified = true;
		} finally {
			root.unmount();
			assert.equal(container.childNodes.length, 0);
			if (verified) assert.deepEqual(refs, ['a', '-a', 'b', '-b']);
			container.remove();
		}
	}
}
const diagnostics = {};
const heapRecords = {};
const heapFamilies = {};
for (const [name, values] of Object.entries(records)) {
	const groups = [];
	for (const value of values) {
		let group = groups.find((item) => sameMap(item.example, value));
		if (!group) {
			group = { example: value, count: 0 };
			groups.push(group);
		}
		group.count++;
	}
	diagnostics[name] = {
		records: values.length,
		fastProperties: values.filter(fast).length,
		maps: groups.map(({ example, count }) => ({ count, fields: Object.keys(example) })),
	};
	if (!observe)
		assert.equal(groups.length, 1, `${name} must retain one map across the exercised modes`);
	heapFamilies[name] = groups.map(({ example }, index) => {
		const key = `${name}:${index}`;
		heapRecords[key] = example;
		return key;
	});
}
const payload = {
	suite: 'runtime-object-shapes',
	node: process.version,
	v8: process.versions.v8,
	runtimeSha: createHash('sha256').update(fs.readFileSync(runtimePath)).digest('hex'),
	semanticSha: createHash('sha256').update(JSON.stringify(outcomes)).digest('hex'),
	diagnostics,
	heap: await inspectRecords(heapRecords, heapFamilies),
};
const output = process.argv[3]?.startsWith('--') ? undefined : process.argv[3];
if (output) fs.writeFileSync(output, JSON.stringify(payload, null, 2) + '\n');
console.log(JSON.stringify(payload, null, 2));
await window.happyDOM.close();
