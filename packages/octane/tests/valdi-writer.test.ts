// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CompileOptions, ValdiWriterEffectiveType } from 'octane/compiler';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { createWriterRecorder } from './_valdi-writer.js';

const renderer = {
	id: 'native',
	module: '@test/valdi-writer',
	target: 'valdi',
	server: 'unsupported',
	text: 'reject',
} as const;

const writerSource = readFileSync(
	join(import.meta.dirname, '_fixtures', 'valdi-writer.tsrx'),
	'utf8',
);

// These synthetic source fixtures use an explicitly supplied writer adapter,
// rather than the DOM compiler selected by the normal Vitest fixture plugin.
function writerFixture(source: string, dev: boolean, options?: CompileOptions) {
	const recorder = createWriterRecorder();
	const module = loadCompiledFixtureSource(source, {
		id: '/src/WriterFixture.tsrx',
		mode: 'client',
		compileOptions: { ...options, renderer, hmr: false, dev },
		runtimeModules: { [renderer.module]: recorder.adapter },
	});
	return { ...recorder, module };
}

describe.each([false, true])('compiled Valdi writer behavior in dev=%s', (dev) => {
	it.each([
		[
			'Comments.tsrx',
			`function Leaf() @{ <label value="child" /> }
			 export function Scene() @{ <Leaf>{/* explanation */}{} { /* another comment */ }</Leaf> }`,
		],
		[
			'Comments.tsx',
			`function Leaf() { return <label value="child" />; }
			 export function Scene() { return <Leaf>{/* explanation */}{} { /* another comment */ }</Leaf>; }`,
		],
	])('treats comments and empty expressions as absent component children in %s', (id, source) => {
		const recorder = createWriterRecorder();
		const module = loadCompiledFixtureSource(source, {
			id,
			mode: 'client',
			compileOptions: { renderer, hmr: false, dev },
			runtimeModules: { [renderer.module]: recorder.adapter },
		});
		const output = recorder.render(module.Scene, {});
		expect(
			output.map((node) => ({ tag: node.tag, props: node.props, children: node.children })),
		).toEqual([{ tag: 'label', props: { value: 'child' }, children: [] }]);
	});

	it.each(['text', '<label value="nested" />', '{() => null}'])(
		'continues to reject nonempty component children: %s',
		(children) => {
			expect(() =>
				writerFixture(
					`function Leaf() @{ <label value="child" /> }
					 export function Scene() @{ <Leaf>{/* explanation */}${children}</Leaf> }`,
					dev,
				),
			).toThrow(/component children\/render props are not supported/);
		},
	);

	it('writes host and component props through conditionals and keyed loops', () => {
		const fixture = writerFixture(writerSource, dev);
		const onTap = vi.fn();
		const props = {
			active: true,
			extra: { tone: 'spread', amount: 3 },
			tone: 'calm',
			onTap,
			items: [
				{ id: 'a', value: 'Alpha' },
				{ id: 'b', value: 'Beta' },
			],
		};
		const [root] = fixture.render(fixture.module.Scene, props);
		expect(root.tag).toBe('view');
		expect(root.props).toEqual({ enabled: true, amount: 3, tone: 'final', onTap });
		expect(root.children.map((node) => [node.tag, node.props])).toEqual([
			['label', { value: 'Alpha', tone: 'calm' }],
			['label', { value: 'Beta', tone: 'calm' }],
		]);
		root.props.onTap('selected');
		expect(onTap).toHaveBeenCalledWith('selected');

		const empty = fixture.render(fixture.module.Scene, { ...props, items: [] });
		expect(empty[0].children.map((node) => node.props.value)).toEqual(['empty']);
		const inactive = fixture.render(fixture.module.Scene, { ...props, active: false });
		expect(inactive[0].children.map((node) => node.props.value)).toEqual(['inactive']);
		const withoutExtra = fixture.render(fixture.module.Scene, { ...props, extra: {} });
		expect(withoutExtra[0].props).toEqual({ enabled: true, tone: 'final', onTap });
	});

	it('preserves typed and nullish attribute values without applying proofs to enclosing expressions', () => {
		const source = `export function Scene(props) @{
			<view flag={props.flag} amount={props.amount} label={props.label}
				onTap={props.onTap} style={props.style} mixed={props.primary ?? props.fallback} />
		}`;
		const proofs: Array<[string, ValdiWriterEffectiveType]> = [
			['props.flag', 'boolean'],
			['props.amount', 'number'],
			['props.label', 'string'],
			['props.onTap', 'function'],
			['props.style', 'style'],
			['props.primary', 'string'],
		];
		const fixture = writerFixture(source, dev, {
			valdiWriterFacts: {
				version: 1,
				expressions: proofs.map(([expression, effectiveType]) => {
					const start = source.indexOf(expression);
					return { start, end: start + expression.length, effectiveType, isNullable: true };
				}),
			},
		});
		const onTap = vi.fn();
		const style = { opacity: 0.5 };
		const fallback = { arbitrary: 'object' };
		const [first] = fixture.render(fixture.module.Scene, {
			flag: true,
			amount: 3,
			label: 'label',
			onTap,
			style,
			primary: undefined,
			fallback,
		});
		expect(first.props).toEqual({
			flag: true,
			amount: 3,
			label: 'label',
			onTap,
			style,
			mixed: fallback,
		});
		for (const empty of [null, undefined]) {
			const [cleared] = fixture.render(fixture.module.Scene, {
				flag: empty,
				amount: empty,
				label: empty,
				onTap: empty,
				style: empty,
				primary: undefined,
				fallback,
			});
			expect(cleared.props).toEqual({
				flag: empty,
				amount: empty,
				label: empty,
				onTap: empty,
				style: empty,
				mixed: fallback,
			});
		}
	});

	it('uses the generic writer contract for the special layout callback', () => {
		const fixture = writerFixture(
			`export function Scene(props) @{ <view $onLayout={() => props.record('layout')} /> }`,
			dev,
		);
		const record = vi.fn();
		const [node] = fixture.render(fixture.module.Scene, { record });
		node.props.$onLayout();
		expect(record).toHaveBeenCalledWith('layout');
	});

	it('evaluates spreads and explicit keys once in authored order', () => {
		const fixture = writerFixture(
			`export function Scene(props) @{
				<view left={props.read('left')} {...props.spread()}
					key={props.read('key')} right={props.read('right')} />
			 }`,
			dev,
		);
		const order: string[] = [];
		const [node] = fixture.render(fixture.module.Scene, {
			read(name: string) {
				order.push(name);
				return name;
			},
			spread() {
				order.push('spread');
				return { left: 'overridden', middle: 5, key: 'spread-key' };
			},
		});
		expect(order).toEqual(['left', 'spread', 'key', 'right']);
		expect(node.props).toEqual({ left: 'overridden', middle: 5, right: 'right' });
		expect(node.key).toBeDefined();
	});

	it('passes spread component props without turning their key into a view-model property', () => {
		const fixture = writerFixture(
			`function Child(props) @{ <label value={props.value} leakedKey={props.key} /> }
			 export function Scene(props) @{ <Child value="before" {...props.extra} key={props.id} /> }`,
			dev,
		);
		const [node] = fixture.render(fixture.module.Scene, {
			extra: { value: 'after', key: 'spread-key' },
			id: 'explicit-key',
		});
		expect(node.props).toEqual({ value: 'after', leakedKey: undefined });
	});

	it('keeps nested and typed keys distinct and stable when rows are reordered', () => {
		const fixture = writerFixture(
			`export function Scene(props) @{
				<>
					@for (const group of props.groups; key group.id) {
						<>
							@for (const item of group.items; key item.id) {
								<label key={item.version} value={item.value} />
							}
						</>
					}
				</>
			 }`,
			dev,
		);
		const groups = [
			{
				id: 'left',
				items: [
					{ id: 1, value: 'number', version: 'v1' },
					{ id: '1', value: 'string', version: 'v1' },
				],
			},
			{ id: 'right', items: [{ id: 1, value: 'other group', version: 'v1' }] },
		];
		const before = fixture.render(fixture.module.Scene, { groups });
		const identities = new Map(before.map((node) => [node.props.value, node.key]));
		expect(new Set(identities.values()).size).toBe(3);
		expect([...identities.values()].every((key) => key !== undefined)).toBe(true);
		const reordered = fixture.render(fixture.module.Scene, {
			groups: [...groups]
				.reverse()
				.map((group) => ({ ...group, items: [...group.items].reverse() })),
		});
		expect(reordered.map((node) => node.props.value)).toEqual(['other group', 'string', 'number']);
		for (const node of reordered) expect(node.key).toBe(identities.get(node.props.value));
		const changed = fixture.render(fixture.module.Scene, {
			groups: [{ ...groups[0], items: [{ ...groups[0].items[0], version: 'v2' }] }],
		});
		expect(changed[0].key).not.toBe(identities.get('number'));
	});

	it('preserves independent custom and conditional state plus the live state getter', () => {
		const fixture = writerFixture(
			`import { useState as state } from 'octane';
			 function useCounter(start) { return state(start); }
			 export function Scene(props) @{
				const [first, setFirst, getFirst] = useCounter(1);
				let hidden;
				if (props.include) {
					const [value, setValue] = state(10);
					hidden = value;
					props.capture(setValue);
				}
				const [second, setSecond] = useCounter(100);
				<view first={first} second={second} hidden={hidden} getFirst={getFirst}
					setFirst={setFirst} setSecond={setSecond} />
			 }`,
			dev,
		);
		let setHidden: (value: number) => void = () => {
			throw new Error('The conditional state setter was not published');
		};
		const capture = (setter: (value: number) => void) => {
			setHidden = setter;
		};
		const [first] = fixture.render(fixture.module.Scene, { include: true, capture });
		expect(first.props).toMatchObject({ first: 1, second: 100, hidden: 10 });
		first.props.setFirst((value: number) => value + 2);
		first.props.setSecond(200);
		setHidden(20);
		expect(first.props.getFirst()).toBe(3);
		const [without] = fixture.render(fixture.module.Scene, { include: false, capture });
		expect(without.props).toMatchObject({ first: 3, second: 200, hidden: undefined });
		const [restored] = fixture.render(fixture.module.Scene, { include: true, capture });
		expect(restored.props).toMatchObject({ first: 3, second: 200, hidden: 20 });
	});

	it('allows a custom hook in a component parameter initializer', () => {
		const fixture = writerFixture(
			`import { useState } from 'octane';
			 function useDefaults() { const [value, setValue] = useState(7); return { value, setValue }; }
			 export function Scene(props = useDefaults()) @{
				<label value={props.value} increment={() => props.setValue((value) => value + 1)} />
			 }`,
			dev,
		);
		const [first] = fixture.render(fixture.module.Scene, undefined);
		expect(first.props.value).toBe(7);
		first.props.increment();
		expect(fixture.render(fixture.module.Scene, undefined)[0].props.value).toBe(8);
	});

	it('does not mistake a shadowed undefined binding for a key or a spread ref', () => {
		const fixture = writerFixture(
			`export function Scene({ values, undefined }) @{ <view {...values} /> }`,
			dev,
		);
		const [node] = fixture.render(fixture.module.Scene, {
			values: { value: 'value', ref: undefined, children: undefined },
			undefined: 'shadowed',
		});
		expect(node.key).toBeUndefined();
		expect(node.props).toEqual({ value: 'value' });
	});

	it('forwards memo, callback, ref, and layout-effect semantics to the adapter', () => {
		const fixture = writerFixture(
			`import { useMemo, useCallback, useRef, useLayoutEffect } from 'octane';
			 export function Scene(props) @{
				const total = useMemo(() => props.amount * 2);
				const format = useCallback(() => props.prefix + total);
				const marker = useRef(props.marker);
				useLayoutEffect(() => {
					props.events.push('effect:' + total);
					return () => props.events.push('cleanup:' + total);
				}, [total]);
				<view total={total} format={format} marker={marker.current} />
			 }`,
			dev,
		);
		const events: string[] = [];
		const [first] = fixture.render(fixture.module.Scene, {
			amount: 3,
			prefix: 'a:',
			marker: 'first',
			events,
		});
		expect(first.props.total).toBe(6);
		expect(first.props.format()).toBe('a:6');
		expect(first.props.marker).toBe('first');
		expect(fixture.effects.map((effect) => effect.deps)).toEqual([[6]]);
		const cleanup = fixture.effects[0].create() as () => void;
		const [next] = fixture.render(fixture.module.Scene, {
			amount: 5,
			prefix: 'b:',
			marker: 'second',
			events,
		});
		expect(next.props.total).toBe(10);
		expect(next.props.format()).toBe('b:10');
		expect(next.props.marker).toBe('first');
		expect(fixture.effects.map((effect) => effect.deps)).toEqual([[10]]);
		cleanup();
		fixture.effects[0].create();
		expect(events).toEqual(['effect:6', 'cleanup:6', 'effect:10']);
	});

	it('resolves recursive calls through the registered component export', () => {
		const fixture = writerFixture(
			`export function Scene(props) @{
				<view value={props.depth}>
					@if (props.depth > 0) { <Scene depth={props.depth - 1} /> }
				</view>
			 }`,
			dev,
		);
		const [root] = fixture.render(fixture.module.Scene, { depth: 2 });
		expect(root.props.value).toBe(2);
		expect(root.children[0].props.value).toBe(1);
		expect(root.children[0].children[0].props.value).toBe(0);
		expect(root.children[0].children[0].children).toEqual([]);
	});

	it('keeps default-exported components callable', () => {
		const fixture = writerFixture(
			'export default function Scene(props) @{ <label value={props.value} /> }',
			dev,
		);
		expect(fixture.render(fixture.module.default, { value: 'default' })[0].props.value).toBe(
			'default',
		);
	});
});

it('rejects an incompatible writer ABI before initializing adapter-owned values', () => {
	const recorder = createWriterRecorder();
	const makePrototype = vi.spyOn(recorder.adapter.jsx, 'makeNodePrototype');
	const defineComponent = vi.spyOn(recorder.adapter, 'defineValdiComponent');
	const allocateSlots = vi.spyOn(recorder.adapter, 'hookSlots');
	vi.spyOn(recorder.adapter, 'assertValdiCompilerAbi').mockImplementation(() => {
		throw new Error('Adapter does not support this compiler ABI');
	});
	expect(() =>
		loadCompiledFixtureSource(
			`import { useState } from 'octane';
			 function useValue() { return useState(1); }
			 export function Scene() @{ const [value] = useValue(); <label value={value} /> }`,
			{
				id: '/src/UnsupportedWriter.tsrx',
				mode: 'client',
				compileOptions: { renderer, hmr: false },
				runtimeModules: { [renderer.module]: recorder.adapter },
			},
		),
	).toThrow(/Adapter does not support this compiler ABI/);
	expect(makePrototype).not.toHaveBeenCalled();
	expect(defineComponent).not.toHaveBeenCalled();
	expect(allocateSlots).not.toHaveBeenCalled();
});
