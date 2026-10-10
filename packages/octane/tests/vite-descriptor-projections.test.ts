// @vitest-environment node
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Window } from 'happy-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { build, type Plugin } from 'vite';
import { octane } from 'octane/compiler/vite';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const files = {
	'App.tsrx': `import { buildRows } from './helper.ts';
export function App(props) @{ const rows = buildRows(props.items); <main>{rows}</main> }`,
	'helper.ts': `import { createElement } from 'octane';
import { Row } from './rows.tsrx';
import { select } from './events.js';
export function buildRows(items: any[]) {
 const out = new Array(items.length);
 for (let i = 0; i < items.length; i++) {
  const item = items[i];
  out[i] = createElement(Row, { key: item.id, id: item.id, label: item.label, wall: 'row', onSelect: select });
 }
 return out;
}`,
	'rows.tsrx': `import { memo } from 'octane';
function View(props) @{ <article><button onClick={() => props.onSelect(props.id, props.label)}>{(props.wall+':'+props.label) as string}</button><input defaultValue="initial" /></article> }
export const Row = memo(View);`,
	'events.js': `export const events = []; export function select(id, label) { events.push([id, label]); }`,
	'entry.ts': `import { createRoot, flushSync } from 'octane';
import { App } from './App.tsrx';
import { buildRows } from './helper.ts';
import { events } from './events.js';
export function run() {
 const host = document.createElement('div'); document.body.append(host);
 const root = createRoot(host);
 const a = {id: 1, label: 'A'}, b = {id: 2, label: 'B'};
 const direct = buildRows([a]), again = buildRows([a]);
 root.render(App, {items: [a,b]}); flushSync(()=>{});
 const held = host.querySelectorAll('article')[1]; held.querySelector('input').value = 'typed';
 const initial = host.textContent;
 const changed = {...a, label:'changed'};
 flushSync(()=>root.render(App, {items:[changed,b]}));
 const updated = host.textContent;
 flushSync(()=>root.render(App, {items:[b,changed]}));
 const reordered = host.textContent;
 host.querySelectorAll('button')[1].click(); flushSync(()=>{});
 const identity = host.querySelector('article') === held;
 const input = host.querySelector('input').value;
 root.unmount();
 const empty = host.childNodes.length === 0; host.remove();
 return {initial,updated,reordered,identity,input,empty,events,
  ordinary: Array.isArray(direct) && direct !== again && direct[0] !== again[0]};
}`,
};

async function consume(
	plugins: Plugin[] = [],
	overrides: Record<string, string> = {},
	compilerOutput?: 'ts',
) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-descriptor-adapter-')));
	roots.push(root);
	mkdirSync(join(root, 'node_modules'));
	symlinkSync(resolve(import.meta.dirname, '..'), join(root, 'node_modules/octane'), 'dir');
	writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
	for (const [name, source] of Object.entries({ ...files, ...overrides })) {
		mkdirSync(dirname(join(root, name)), { recursive: true });
		writeFileSync(join(root, name), source);
	}
	const compiled: Record<string, string> = {};
	const result = await build({
		root,
		configFile: false,
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		plugins: [
			octane({ hmr: false, output: compilerOutput }),
			...plugins,
			{
				name: 'capture-descriptor-output',
				transform(code, id) {
					if (id.startsWith(root + '/')) compiled[id.slice(root.length + 1)] = code;
				},
			},
		],
		build: {
			write: false,
			minify: false,
			lib: { entry: join(root, 'entry.ts'), formats: ['iife'], name: 'fixture' },
		},
	});
	const output = (Array.isArray(result) ? result : [result]).flatMap((item) => {
		if (!('output' in item)) throw new Error('Expected a one-shot build.');
		return item.output;
	});
	const chunk = output.find((item) => item.type === 'chunk');
	if (!chunk || chunk.type !== 'chunk') throw new Error('Expected a bundled fixture.');
	const window = new Window({ settings: { enableJavaScriptEvaluation: true } });
	try {
		window.eval(chunk.code);
		return { compiled, behavior: JSON.parse(JSON.stringify((window as any).fixture.run())) };
	} finally {
		window.close();
	}
}

const expected = (wall = 'row') => ({
	initial: `${wall}:A${wall}:B`,
	updated: `${wall}:changed${wall}:B`,
	reordered: `${wall}:B${wall}:changed`,
	identity: true,
	input: 'typed',
	empty: true,
	events: [[1, 'changed']],
	ordinary: true,
});
const hasProjection = (compiled: Record<string, string>) =>
	Object.keys(compiled).some((id) => id.includes('?octane-descriptor-projection='));

// These execute the final transformed graph: source-only metadata cannot prove
// the function or imports that a later plugin leaves in the bundle.
describe('Vite imported descriptor projection proofs', { timeout: 30_000 }, () => {
	it.each([
		['default JavaScript', undefined],
		['TypeScript', 'ts'],
	] as const)(
		'preserves ordinary helper calls, keyed state and current event props (%s output)',
		async (_label, output) => {
			const { compiled, behavior } = await consume([], {}, output);
			expect(hasProjection(compiled)).toBe(true);
			expect(behavior).toEqual(expected());
		},
	);

	it('declines a later transform that changes a still-projectable helper', async () => {
		const { compiled, behavior } = await consume([
			{
				name: 'change-projection-value',
				transform(code, id) {
					if (id.endsWith('/helper.ts'))
						return code.replace(/wall: ["']row["']/, "wall: 'changed'");
				},
			},
		]);
		expect(hasProjection(compiled)).toBe(false);
		expect(behavior).toEqual(expected('changed'));
	});

	it('declines a later component wrapper that has no ordinary memo provenance', async () => {
		const { compiled, behavior } = await consume([
			{
				name: 'wrap-memo-component',
				transform(code, id) {
					if (id.endsWith('/rows.tsrx'))
						return code.replace(
							/memo\(View\)/,
							"memo(new Proxy(View, { getPrototypeOf() { throw new Error('opaque reflection'); } }))",
						);
				},
			},
		]);
		expect(hasProjection(compiled)).toBe(false);
		expect(behavior).toEqual(expected());
	});

	it('keeps an explicit comparator on ordinary dispatch', async () => {
		const { compiled, behavior } = await consume([], {
			'rows.tsrx': files['rows.tsrx'].replace(
				'memo(View)',
				'memo(View, (a,b) => a.label === b.label)',
			),
		});
		expect(hasProjection(compiled)).toBe(false);
		expect(behavior).toEqual(expected());
	});

	it('resolves companion captures from the original helper and initializes them once', async () => {
		const { compiled, behavior } = await consume(
			[
				{
					name: 'helper-capture-resolution',
					enforce: 'pre',
					resolveId(request, importer) {
						if (request === './events.js' && importer?.endsWith('/helper.ts'))
							return join(dirname(importer), 'captures/events.js');
					},
				},
			],
			{
				'captures/events.js': `import { events } from '../events.js';
globalThis.captureInitializations = (globalThis.captureInitializations || 0) + 1;
export function select(id, label) { events.push([id, 'capture:' + label]); }`,
				'entry.ts': files['entry.ts'].replace(
					'return {initial,',
					'return {initialized: globalThis.captureInitializations, initial,',
				),
			},
		);
		expect(hasProjection(compiled)).toBe(true);
		expect(behavior).toEqual({ ...expected(), events: [[1, 'capture:changed']], initialized: 1 });
	});

	it('declines when the helper issuer resolves another runtime module', async () => {
		const { compiled, behavior } = await consume(
			[
				{
					name: 'helper-runtime-resolution',
					enforce: 'pre',
					resolveId(request, importer) {
						if (request === 'octane' && importer?.endsWith('/helper.ts'))
							return join(dirname(importer), 'other-runtime.js');
					},
				},
			],
			{ 'other-runtime.js': `export * from 'octane';` },
		);
		expect(hasProjection(compiled)).toBe(false);
		expect(behavior).toEqual(expected());
	});

	it('preserves an import whose name matches the companion export hint', async () => {
		const { compiled, behavior } = await consume([], {
			'helper.ts': files['helper.ts']
				.replace('import { select }', 'import { select as __octaneDescriptorProjection }')
				.replace('onSelect: select', 'onSelect: __octaneDescriptorProjection'),
		});
		expect(hasProjection(compiled)).toBe(true);
		expect(behavior).toEqual(expected());
	});
});
