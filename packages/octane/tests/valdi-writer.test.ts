// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CompileOptions, CompileRenderer, ValdiWriterEffectiveType } from 'octane/compiler';
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
	const selectedRenderer: CompileRenderer = options?.renderer ?? renderer;
	const recorder = createWriterRecorder(
		Array.isArray(selectedRenderer.capabilities) &&
			selectedRenderer.capabilities.includes('host-text-site')
			? 3
			: selectedRenderer.text === 'host' ||
				  (Array.isArray(selectedRenderer.capabilities) &&
						selectedRenderer.capabilities.includes('host-ref'))
				? 2
				: 1,
	);
	const module = loadCompiledFixtureSource(source, {
		id: '/src/WriterFixture.tsrx',
		mode: 'client',
		compileOptions: { ...options, renderer: selectedRenderer, hmr: false, dev },
		runtimeModules: { [selectedRenderer.module]: recorder.adapter },
	});
	return { ...recorder, module };
}

describe.each([false, true])('compiled Valdi writer behavior in dev=%s', (dev) => {
	it('keeps writer text sites and nested row paths stable through omission and reorder', () => {
		const { render, module } = writerFixture(
			`export function Scene(props) @{
				<frame>
					start
					@for (const group of props.groups; key group.id) {
						@for (const item of group.items; key item.id) {
							<>{item.left as string}@if (item.show) { <>{item.right as string}</> }</>
						}
					}
					end
				</frame>
			}`,
			dev,
			{ renderer: { ...renderer, text: 'host', capabilities: ['host-text-site'] } },
		);
		const one = { id: 'one', items: [{ id: 'same', left: 'A', right: 'a', show: true }] };
		const two = { id: 'two', items: [{ id: 'same', left: 'B', right: 'b', show: true }] };
		const nodes = (groups: (typeof one)[]) => render(module.Scene, { groups })[0].children;
		const original = nodes([one, two]);
		const keys = new Map(original.map((node) => [String(node.props.value).trim(), node.key]));
		expect(new Set(keys.values()).size).toBe(6);
		const changed = nodes([{ ...two, items: [{ ...two.items[0], show: false }] }, one]);
		expect(changed.map((node) => String(node.props.value).trim())).toEqual([
			'start',
			'B',
			'A',
			'a',
			'end',
		]);
		expect(changed.map((node) => node.key)).toEqual(
			['start', 'B', 'A', 'a', 'end'].map((v) => keys.get(v)),
		);
	});

	it('delivers falsy scalars and array values unchanged at host text sites', () => {
		const { render, module } = writerFixture(
			`export function Scene(props) @{ <frame>{props.zero && props.unreachable()}{props.items}</frame> }`,
			dev,
			{ renderer: { ...renderer, text: 'host', capabilities: ['host-text-site'] } },
		);
		const unreachable = vi.fn(() => 'wrong');
		const items = ['alpha', 4];
		const children = render(module.Scene, { zero: 0, unreachable, items })[0].children;
		expect(children.map((node) => node.props.value)).toEqual([0, items]);
		expect(children[1].props.value).toBe(items);
		expect(unreachable).not.toHaveBeenCalled();
	});

	it('writes JSX interspersed with text in literal arrays in authored order', () => {
		const { render, module } = writerFixture(
			`export function Scene(props) @{ <frame>{['first', <badge value={props.value}/>, ...props.tail, 'last']}</frame> }`,
			dev,
			{ renderer: { ...renderer, text: 'host', capabilities: ['host-text-site'] } },
		);
		const tail = ['second', 'third'];
		expect(render(module.Scene, { value: 'badge', tail })[0].children).toMatchObject([
			{ tag: '#text', props: { value: 'first' } },
			{ tag: 'badge', props: { value: 'badge' } },
			{ tag: '#text', props: { value: tail } },
			{ tag: '#text', props: { value: 'last' } },
		]);
	});

	it('materializes iterable spreads in mixed JSX arrays and rejects non-iterables', () => {
		const { render, module } = writerFixture(
			`export function Scene(props) @{ <frame>{['first', <badge/>, ...props.tail]}</frame> }`,
			dev,
			{ renderer: { ...renderer, text: 'host', capabilities: ['host-text-site'] } },
		);
		expect(render(module.Scene, { tail: new Set(['east', 'west']) })[0].children).toMatchObject([
			{ tag: '#text', props: { value: 'first' } },
			{ tag: 'badge' },
			{ tag: '#text', props: { value: ['east', 'west'] } },
		]);
		expect(() => render(module.Scene, { tail: 12 })).toThrow(/not iterable/);
	});

	it('evaluates a logical JSX left operand once and renders its zero fallback', () => {
		const { render, module } = writerFixture(
			`export function Scene(props) @{ <frame>{props.read() && <badge value="present"/>}</frame> }`,
			dev,
			{ renderer: { ...renderer, text: 'host', capabilities: ['host-text-site'] } },
		);
		const read = vi.fn(() => 0);
		expect(render(module.Scene, { read })[0].children).toMatchObject([
			{ tag: '#text', props: { value: 0 } },
		]);
		expect(read).toHaveBeenCalledOnce();
	});

	it('retains one authored identity when a scalar conditional changes branches', () => {
		const { render, module } = writerFixture(
			`export function Scene(props) @{ <frame>{props.active ? 'north' : 'south'}</frame> }`,
			dev,
			{ renderer: { ...renderer, text: 'host', capabilities: ['host-text-site'] } },
		);
		const a = render(module.Scene, { active: true })[0].children[0];
		const b = render(module.Scene, { active: false })[0].children[0];
		expect(a.props.value).toBe('north');
		expect(b.props.value).toBe('south');
		expect(a.key).toBeDefined();
		expect(a.key).toBe(b.key);
	});

	it('supports primitive and array component output at the writer root', () => {
		const { render, module } = writerFixture(
			`export function Scene(props) { return props.values; }`,
			dev,
			{ renderer: { ...renderer, text: 'host', capabilities: ['host-text-site'] } },
		);
		const values = ['north', 'east'];
		const written = render(module.Scene, { values });
		expect(written).toMatchObject([{ tag: '#text', props: { value: values } }]);
		expect(written[0].props.value).toBe(values);
	});

	it('enforces allowed authored hosts independently of refs, components and text placement', () => {
		const config = { ...renderer, validation: { allowedTags: ['frame', 'badge'] } };
		expect(() =>
			writerFixture(`export function Scene() @{ <unknown-host/> }`, dev, { renderer: config }),
		).toThrow(/does not allow <unknown-host>/);
		const { render, module } = writerFixture(
			`function Leaf() @{ <badge value="ok"/> } export function Scene() @{ <frame><Leaf/></frame> }`,
			dev,
			{ renderer: config },
		);
		expect(render(module.Scene, {})[0].children).toMatchObject([
			{ tag: 'badge', props: { value: 'ok' } },
		]);
	});

	it('rejects an ABI 2 adapter before creating prototypes for opted-in text sites', () => {
		const recorder = createWriterRecorder(2);
		expect(() =>
			loadCompiledFixtureSource(`export function Scene() @{ <frame>hello</frame> }`, {
				id: '/src/WriterFixture.tsrx',
				mode: 'client',
				compileOptions: {
					renderer: { ...renderer, text: 'host', capabilities: ['host-text-site'] },
					hmr: false,
					dev,
				},
				runtimeModules: { [renderer.module]: recorder.adapter },
			}),
		).toThrow(/Unsupported writer ABI 3/);
	});

	it('requires host text when an adapter selects authored text sites', () => {
		expect(() =>
			writerFixture(`export function Scene() @{ <frame/> }`, dev, {
				renderer: { ...renderer, text: 'reject', capabilities: ['host-text-site'] },
			}),
		).toThrow(/host-text-site capability requires text: "host"/);
	});

	it('writes opted-in host text in order, preserving spaces, semicolons and encoded whitespace', () => {
		const { render, module } = writerFixture(
			`export function Scene(props) @{ <text-box><em>left</em> <em>right</em>;&nbsp;{props.value as string}</text-box> }`,
			dev,
			{ renderer: { ...renderer, text: 'host', validation: { textParents: ['text-box', 'em'] } } },
		);
		const read = (value: string) => render(module.Scene, { value })[0].children;
		expect(read('one')).toMatchObject([
			{ tag: 'em', children: [{ props: { value: 'left' } }] },
			{ tag: '#text', props: { value: ' ' } },
			{ tag: 'em', children: [{ props: { value: 'right' } }] },
			{ tag: '#text', props: { value: ';\u00a0' } },
			{ tag: '#text', props: { value: 'one' } },
		]);
		expect(read('two').at(-1)).toMatchObject({ tag: '#text', props: { value: 'two' } });
	});

	it('sends refs to the opted-in host, including last-write-wins spreads without replaying getters', () => {
		const ref = { current: null };
		const discarded = { current: null };
		const getter = vi.fn(() => discarded);
		const { render, module } = writerFixture(
			`export function Scene(props) @{ <frame {...props.first} key={props.key} ref={props.ref} size={12} /> }`,
			dev,
			{ renderer: { ...renderer, capabilities: ['host-ref'] } },
		);
		const written = render(module.Scene, {
			first: {
				get ref() {
					return getter();
				},
			},
			key: 'k',
			ref,
		});
		expect(written[0]).toMatchObject({ tag: 'frame', props: { ref, size: 12 } });
		expect(getter).toHaveBeenCalledOnce();
		expect(written[0].props).not.toHaveProperty('key');
	});

	it('still rejects refs passed to components even when the host accepts refs', () => {
		expect(() =>
			writerFixture(
				`function Leaf() @{ <frame/> } export function Scene(props) @{ <Leaf ref={props.ref} /> }`,
				dev,
				{ renderer: { ...renderer, capabilities: ['host-ref'] } },
			),
		).toThrow(/authored ref props/);
	});

	it('guards opted-in writer calls before prototype creation on an older adapter', () => {
		const recorder = createWriterRecorder();
		expect(() =>
			loadCompiledFixtureSource(`export function Scene() @{ <text-box>hello</text-box> }`, {
				id: '/src/WriterFixture.tsrx',
				mode: 'client',
				compileOptions: { renderer: { ...renderer, text: 'host' }, hmr: false, dev },
				runtimeModules: { [renderer.module]: recorder.adapter },
			}),
		).toThrow(/Unsupported writer ABI 2/);
	});

	it('keeps configured host text placement restrictions in opted-in mode', () => {
		expect(() =>
			writerFixture(`export function Scene() @{ <frame>unsupported here</frame> }`, dev, {
				renderer: { ...renderer, text: 'host', validation: { textParents: ['text-box'] } },
			}),
		).toThrow(/does not allow authored JSX text under <frame>/);
	});
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

	it.each([false, true])(
		'forwards method dependencies despite a shadowing local (strong=%s)',
		(strong) => {
			const fixture = writerFixture(
				`import { useLayoutEffect } from 'octane';
			 export function Scene(props) @{
				const _$__methodDep = () => 42;
				useLayoutEffect(() => props.notify());
				<view value={_$__methodDep()} />
			 }`,
				dev,
				{ strong },
			);
			const first = () => {};
			const next = () => {};
			expect(fixture.render(fixture.module.Scene, { notify: first })[0].props.value).toBe(42);
			expect(fixture.effects[0].deps).toEqual([first]);
			fixture.render(fixture.module.Scene, { notify: next });
			expect(fixture.effects[0].deps).toEqual([next]);
		},
	);

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
