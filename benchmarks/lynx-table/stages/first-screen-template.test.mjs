import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { build } from 'esbuild';
import { compile } from '../../../packages/octane/src/compiler/compile.js';
import { lynxMainThreadRenderer } from '../../../packages/lynx/src/config.runtime.js';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

test('compiles and executes a main-thread component scope through the real TSRX pipeline', async () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-compiled-template-'));
	try {
		const entry = path.join(temporary, 'entry.mjs');
		const output = path.join(temporary, 'entry.bundle.mjs');
		const mainRenderer = path
			.join(repositoryRoot, 'packages/lynx/src/main-renderer.ts')
			.replaceAll('\\', '/');
		const source = `
import { renderLynxFirstScreen } from '@octanejs/lynx/main-renderer';
function Row({ id, onTap }) @{
	<view id={id}>
		<text>{id}</text>
		<text bindtap={onTap}>{id}</text>
		<text bindtap={onTap}>{'x'}</text>
	</view>
}
function App({ items, onTap }) @{
	<view id="rows">
		@for (const item of items; key item) {
			<Row id={item} onTap={onTap} />
		}
	</view>
}
export function run(count) {
	return renderLynxFirstScreen(App, {
		items: Array.from({ length: count }, (_, index) => 'row-' + index),
		onTap() {},
	});
}
`;
		const compiled = compile(source, '/src/compiled-template.lynx.tsrx', {
			hmr: false,
			inlineHookMemo: false,
			renderer: { ...lynxMainThreadRenderer, id: 'lynx' },
			universalRuntime: { runtime: 'lynx', thread: 'main-thread' },
		}).code;
		fs.writeFileSync(entry, compiled);
		await build({
			entryPoints: [entry],
			bundle: true,
			format: 'esm',
			logLevel: 'silent',
			outfile: output,
			platform: 'node',
			plugins: [
				{
					name: 'local-lynx-main-renderer',
					setup(esbuild) {
						esbuild.onResolve({ filter: /^@octanejs\/lynx\/main-renderer$/ }, () => ({
							path: mainRenderer,
						}));
					},
				},
			],
		});

		const { run } = await import(pathToFileURL(output).href);
		const result = run(1000);
		const ranges = result.batch.commands.filter((command) => command.op === 'mount-template-range');
		assert.equal(result.hostCount, 7001);
		assert.equal(result.logicalCount, 9001);
		assert.equal(result.batch.commands.length, 1002);
		assert.equal(ranges.length, 1000);
		assert.ok(ranges.every((range) => range.program === ranges[0].program));
		assert.equal(ranges[0].program.nodes.length, 7);
		assert.equal(ranges[0].values.length, 3);
		assert.ok(ranges.every((range) => range.values.length === 3));
		for (let index = 1; index < ranges.length; index++) {
			assert.equal(ranges[index].firstId - ranges[index - 1].firstId, 9);
			assert.equal(ranges[index].firstListenerId - ranges[index - 1].firstListenerId, 2);
		}
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true });
	}
});

// Runtime structural guard for the benchmark row topology and fail-closed matrix.
// The real app/bundle count smoke remains the authority for its full-shell total.
test('compacts a synthetic table-shaped component scope without collapsing its identity ledger', async () => {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-first-screen-template-'));
	try {
		const entry = path.join(temporary, 'entry.ts');
		const output = path.join(temporary, 'entry.mjs');
		const mainRenderer = path
			.join(repositoryRoot, 'packages/lynx/src/main-renderer.ts')
			.replaceAll('\\', '/');
		fs.writeFileSync(
			entry,
			`
import {
	defineUniversalComponent,
	renderLynxFirstScreen,
			universalComponent,
	universalActivity,
	universalFor,
	universalPlan,
	universalProps,
	universalValue,
} from ${JSON.stringify(mainRenderer)};

const rowsPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	propsSlot: 0,
	children: [{ kind: 'slot', slot: 1 }],
});
const rowPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	bindings: [['id', 0]],
	children: [
		{ kind: 'host', type: 'text', props: { class: 'col-id' }, children: [{ kind: 'slot', slot: 1 }] },
		{
			kind: 'host',
			type: 'text',
			props: { class: 'col-label' },
			bindings: [['bindtap', 2]],
			children: [{ kind: 'slot', slot: 3 }],
		},
		{
			kind: 'host',
			type: 'text',
			props: { class: 'col-remove' },
			bindings: [['bindtap', 2]],
			children: [{ kind: 'slot', slot: 4 }],
		},
	],
});
const Row = defineUniversalComponent('lynx', (props) =>
	universalValue(rowPlan, [props.id, 'id:' + props.id, props.onTap, 'label:' + props.id, 'x']),
);
const componentScope = (items, key, render) =>
	universalFor(items, key, render, null, false, false, undefined, undefined, undefined, true);
const App = defineUniversalComponent('lynx', (props) =>
	universalValue(rowsPlan, [
		universalProps([
			['set', 'id', 'rows'],
			['set', 'bindtap', props.onTap],
		]),
		componentScope(
			props.items,
			(item) => item,
			(item) =>
				universalComponent(
					'lynx',
					Row,
					universalProps([
						['set', 'id', item],
						['set', 'onTap', props.onTap],
					]),
				),
		),
	]),
);
const PlainApp = defineUniversalComponent('lynx', (props) =>
	universalValue(rowsPlan, [
		universalProps([
			['set', 'id', 'rows'],
			['set', 'bindtap', props.onTap],
		]),
		universalFor(
			props.items,
			(item) => item,
			(item) =>
				universalComponent(
					'lynx',
					Row,
					universalProps([
						['set', 'id', item],
						['set', 'onTap', props.onTap],
					]),
				),
		),
	]),
);

const hostPlan = universalPlan('lynx', { kind: 'host', type: 'view', propsSlot: 0 });
const listPlan = universalPlan('lynx', { kind: 'host', type: 'list', children: [] });
const listItemPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'list-item',
	props: { 'item-key': 'safe-item' },
});
const listParentPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'list',
	children: [{ kind: 'slot', slot: 0 }],
});
const mainThreadPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	props: { 'main-thread:ref': { _wvid: 'unsafe-direct-ref' } },
});
const internalRangePlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	children: [{ kind: 'range', children: [{ kind: 'host', type: 'view' }] }],
});
const conditionalPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	children: [{ kind: 'if', conditionSlot: 0, then: { kind: 'host', type: 'view' } }],
});
const nonScalarPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	bindings: [['data', 0]],
});
const protoBindingPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	bindings: [['__proto__', 0]],
});
const symbolProp = Symbol('first-screen-static-prop');
const symbolPropPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	props: { [symbolProp]: 'preserved' },
});
const Safe = defineUniversalComponent('lynx', () =>
	universalValue(hostPlan, [universalProps([['set', 'id', 'safe']])]),
);
const componentChildPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	children: [{ kind: 'component', renderer: 'lynx', component: Safe }],
});
const SafeListItem = defineUniversalComponent('lynx', () => universalValue(listItemPlan, []));
const MultiRoot = defineUniversalComponent('lynx', () => [
	universalValue(hostPlan, [universalProps([['set', 'id', 'first']])]),
	universalValue(hostPlan, [universalProps([['set', 'id', 'second']])]),
]);
const Hidden = defineUniversalComponent('lynx', () =>
	universalActivity('hidden', () =>
		universalValue(hostPlan, [universalProps([['set', 'id', 'hidden']])]),
	),
);
const NativeList = defineUniversalComponent('lynx', () => universalValue(listPlan, []));
const MainThread = defineUniversalComponent('lynx', () => universalValue(mainThreadPlan, []));
const InternalRange = defineUniversalComponent('lynx', () => universalValue(internalRangePlan, []));
const Conditional = defineUniversalComponent('lynx', () => universalValue(conditionalPlan, [true]));
const ComponentChild = defineUniversalComponent('lynx', () =>
	universalValue(componentChildPlan, []),
);
const NonScalar = defineUniversalComponent('lynx', () =>
	universalValue(nonScalarPlan, [{ safe: true }]),
);
const ProtoBinding = defineUniversalComponent('lynx', () =>
	universalValue(protoBindingPlan, ['ignored-by-generic-props']),
);
const SymbolProp = defineUniversalComponent('lynx', () => universalValue(symbolPropPlan, []));
const InnerScope = defineUniversalComponent('lynx', () =>
	universalValue(rowsPlan, [
		universalProps([['set', 'id', 'nested']]),
		componentScope(['inner'], (item) => item, () => universalComponent('lynx', Safe)),
	]),
);
const scene = (Item, options = {}) =>
	defineUniversalComponent('lynx', () => {
		const loop = componentScope(
			['item'],
			(item) => (options.nullKey ? null : item),
			() => universalComponent('lynx', Item),
		);
		return options.nativeListParent ? universalValue(listParentPlan, [loop]) : loop;
	});
const DirectHost = defineUniversalComponent('lynx', () =>
	componentScope(
		['item'],
		(item) => item,
		() => universalValue(hostPlan, [universalProps([['set', 'id', 'direct-host']])]),
	),
);
const ExplicitComponentKey = defineUniversalComponent('lynx', () =>
	componentScope(
		['item'],
		(item) => item,
		() => universalComponent('lynx', Safe, null, 'authored-component-key'),
	),
);

export function run(count) {
	return renderLynxFirstScreen(App, {
		items: Array.from({ length: count }, (_, index) => 'row-' + index),
		onTap() {},
	});
}
export function runPlain(count) {
	return renderLynxFirstScreen(PlainApp, {
		items: Array.from({ length: count }, (_, index) => 'row-' + index),
		onTap() {},
	});
}
export function runEngineSymbolProbe() {
	const probePlan = universalPlan('lynx', {
		kind: 'host',
		type: 'view',
		props: { class: 'safe-static-props' },
	});
	const Probe = defineUniversalComponent('lynx', () => universalValue(probePlan, []));
	const ProbeApp = defineUniversalComponent('lynx', () =>
		componentScope(
			['item'],
			(item) => item,
			() => universalComponent('lynx', Probe),
		),
	);
	return renderLynxFirstScreen(ProbeApp, {});
}
export function runUnsafe() {
	return Object.fromEntries(
		[
			['non-component body', DirectHost],
			['explicit component key', ExplicitComponentKey],
			['multiple physical roots', scene(MultiRoot)],
			['hidden host', scene(Hidden)],
			['native-list descendant', scene(NativeList)],
			['native-list ancestor', scene(SafeListItem, { nativeListParent: true })],
			['direct main-thread prop', scene(MainThread)],
			['internal range', scene(InternalRange)],
			['internal component', scene(ComponentChild)],
			['internal branch', scene(Conditional)],
			['non-scalar binding', scene(NonScalar)],
			['dynamic __proto__ binding', scene(ProtoBinding)],
			['static symbol prop', scene(SymbolProp)],
			['null key', scene(Safe, { nullKey: true })],
			['nested component scope', scene(InnerScope)],
		].map(([label, component]) => [
			label,
			renderLynxFirstScreen(component, {}).batch.commands.map((command) => command.op),
		]),
	);
}
`,
		);
		await build({
			entryPoints: [entry],
			bundle: true,
			format: 'esm',
			logLevel: 'silent',
			outfile: output,
			platform: 'node',
		});

		const { run, runEngineSymbolProbe, runPlain, runUnsafe } = await import(
			pathToFileURL(output).href
		);
		const empty = run(0);
		assert.equal(empty.hostCount, 1);
		assert.equal(empty.logicalCount, 1);
		assert.deepEqual(
			empty.batch.commands.map((command) => command.op),
			['create', 'event', 'insert'],
		);

		const plain = runPlain(1000);
		assert.equal(plain.hostCount, 7001);
		assert.equal(plain.logicalCount, 9001);
		assert.equal(plain.batch.commands.length, 16_003);
		assert.ok(plain.batch.commands.every((command) => command.op !== 'mount-template'));

		const thousand = run(1000);
		const thousandRanges = thousand.batch.commands.filter(
			(command) => command.op === 'mount-template-range',
		);
		assert.equal(thousand.hostCount, 7001);
		assert.equal(thousand.logicalCount, 9001);
		assert.equal(thousand.batch.commands.length, 1003);
		assert.equal(thousandRanges.length, 1000);
		assert.ok(thousandRanges.every((range) => range.program === thousandRanges[0].program));

		for (const [label, operations] of Object.entries(runUnsafe())) {
			assert.ok(!operations.includes('mount-template-range'), label);
		}

		const getOwnPropertySymbols = Object.getOwnPropertySymbols;
		try {
			// PrimJS can report non-symbol own keys through this API. The template
			// proof must ignore those entries while still rejecting genuine symbols.
			Object.getOwnPropertySymbols = (target) => [
				...getOwnPropertySymbols(target),
				...Object.keys(target),
			];
			const primJsSafe = runEngineSymbolProbe();
			assert.equal(
				primJsSafe.batch.commands.filter((command) => command.op === 'mount-template-range').length,
				1,
			);
			assert.ok(!runUnsafe()['static symbol prop'].includes('mount-template-range'));
		} finally {
			Object.getOwnPropertySymbols = getOwnPropertySymbols;
		}

		const count = 32;
		const result = run(count);
		const ranges = result.batch.commands.filter((command) => command.op === 'mount-template-range');
		assert.equal(result.hostCount, 1 + count * 7);
		assert.equal(result.logicalCount, 1 + count * 9);
		assert.equal(result.batch.commands.length, count + 3);
		assert.equal(ranges.length, count);
		assert.ok(ranges.every((range) => range.program === ranges[0].program));
		assert.deepEqual(
			ranges[0].program.nodes.map(({ type, parent }) => ({ type, parent })),
			[
				{ type: 'view', parent: -1 },
				{ type: 'text', parent: 0 },
				{ type: '#text', parent: 1 },
				{ type: 'text', parent: 0 },
				{ type: '#text', parent: 3 },
				{ type: 'text', parent: 0 },
				{ type: '#text', parent: 5 },
			],
		);
		assert.equal(ranges[0].firstId, 4);
		assert.equal(ranges[1].firstId, 13);
		assert.equal(ranges[0].firstListenerId, 1_000_001);
		assert.equal(ranges.at(-1).firstListenerId, 1_000_001 + (count - 1) * 2);
		assert.ok(ranges.every((range) => range.values.length === 4));
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true });
	}
});
