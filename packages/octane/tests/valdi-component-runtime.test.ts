// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { createWriterRecorder } from './_valdi-writer.js';

const renderer = {
	id: 'native',
	module: '@test/valdi-writer',
	target: 'valdi',
	server: 'unsupported',
	text: 'host',
	capabilities: ['host-text-site', 'component-runtime'],
} as const;

type Deferred = { render: () => void };

function fixture(source: string, dev: boolean, abi = 4) {
	const recorder = createWriterRecorder(abi);
	const keys: Array<string | undefined> = [];
	const beginComponent = recorder.adapter.jsx.beginComponent;
	const renderText = recorder.adapter.jsx.renderText;
	recorder.adapter.jsx.beginComponent = (component, prototype, key) => {
		keys.push(key);
		beginComponent(component, prototype, key);
	};
	recorder.adapter.jsx.renderText = (prototype, value, key) => {
		if (Array.isArray(value)) {
			for (const item of value) recorder.adapter.jsx.renderText(prototype, item, key);
		} else if (value !== null && typeof value === 'object' && 'render' in value) {
			(value as Deferred).render();
		} else {
			renderText(prototype, value, key);
		}
	};
	const adapter = {
		...recorder.adapter,
		useInitialValue(value: unknown, slot: unknown) {
			return recorder.adapter.useState(value, slot)[0];
		},
		memo(component: (props: any) => void, compare?: (a: any, b: any) => boolean) {
			const body = recorder.adapter.getValdiComponentConstructor(component);
			return Object.assign(recorder.adapter.defineValdiComponent(body, { hasHooks: false }), {
				compare,
			});
		},
		createValdiChildren(render: () => void): Deferred {
			return { render };
		},
	};
	const module = loadCompiledFixtureSource(source, {
		id: '/src/ComponentRuntime.tsrx',
		mode: 'client',
		compileOptions: { renderer, hmr: false, dev },
		runtimeModules: { [renderer.module]: adapter },
	});
	return { ...recorder, keys, module };
}

describe.each([false, true])('Valdi component runtime in dev=%s', (dev) => {
	it('renders deferred children and render props in the receiving component scope', () => {
		const { module, render } = fixture(
			`function Leaf(props) @{ <frame>{props.children}{props.row(5)}</frame> }
			 export function Scene() @{ <Leaf row={value => <label value={value} />}><badge value="child" /></Leaf> }`,
			dev,
		);
		const root = render(module['Scene'], {})[0];
		expect(root.children.map((node) => [node.tag, node.props['value']])).toEqual([
			['badge', 'child'],
			['label', 5],
		]);
	});

	it('runs block prop setup at each outlet the receiving component renders', () => {
		const { module, render } = fixture(
			`function Slots({ show, content }) @{
				if (!show) return null;
				<frame><left>{content}</left><right>{content}</right></frame>
			 }
			 export function Scene({ show, next }) @{
				<Slots show={show} content={@{
					const value = next();
					<label value={value} />
				}} />
			 }`,
			dev,
		);
		let count = 0;
		const next = () => ++count;
		expect(render(module['Scene'], { show: false, next })).toEqual([]);
		expect(count).toBe(0);
		expect(render(module['Scene'], { show: true, next })).toMatchObject([
			{
				tag: 'frame',
				children: [
					{ tag: 'left', children: [{ tag: 'label', props: { value: 1 } }] },
					{ tag: 'right', children: [{ tag: 'label', props: { value: 2 } }] },
				],
			},
		]);
	});

	it('keeps @switch arm bindings local when they shadow a sibling’s helper', () => {
		const { module, render } = fixture(
			`export function Scene({ read }) @{
				const value = () => <label value="outer" />;
				<frame>
					@switch (read()) {
						@case 1: { const value = () => <label value="first" />; <>{value}</> }
						@case 2: { const value = 'second'; @{ <label value={value} /> } }
						@default: { <label value="other" /> }
					}
					{value}
				</frame>
			 }`,
			dev,
		);
		const values = [1, 2, '1'];
		const read = () => values.shift();
		for (const expected of ['first', 'second', 'other']) {
			const [frame] = render(module['Scene'], { read });
			expect(frame.children.map((node) => node.props['value'])).toEqual([expected, 'outer']);
		}
	});

	it('retains each initial value from its first render, even at a conditional site', () => {
		const { module, render } = fixture(
			`import { useInitialValue as initial } from 'octane';
			 export function Scene(props) @{
				 let first;
				 if (props.show) first = initial(() => props.value);
				 const second = initial(props.value);
				 <label first={first} second={second} />
			 }`,
			dev,
		);
		const show = (value: number, show: boolean) =>
			render(module['Scene'], { value, show })[0].props;
		expect(show(2, false)['second']).toBe(2);
		expect(show(3, true)).toMatchObject({ first: 3, second: 2 });
		expect(show(4, true)).toMatchObject({ first: 3, second: 2 });
	});

	it('registers hoisted memo bodies and keeps recursive names local to the default export', () => {
		const { module, render } = fixture(
			`import { memo as cache } from 'octane';
			 export const equal = (a, b) => a.n === b.n;
			 const Empty = cache(() => null);
			 export const registry = { Empty, Row: cache(Row) };
			 function Row() @{ <badge /> }
			 export default cache(function Row(props) @{
				 <frame n={props.n}>@if (props.n > 1) { <Row n={props.n - 1} /> }</frame>
			 }, equal);`,
			dev,
		);
		expect(module['default'].compare).toBe(module['equal']);
		const root = render(module['default'], { n: 2 })[0];
		expect(root).toMatchObject({ tag: 'frame', props: { n: 2 }, children: [{ props: { n: 1 } }] });
		expect(render(module['registry'].Row, {})[0].tag).toBe('badge');
		expect(render(module['registry'].Empty, {})).toEqual([]);
	});

	it('resolves a computed identifier in its lexical scope', () => {
		const { module, render } = fixture(
			`function row() { return 'kept'; }
			 export const value = row();
			 export function Label() @{ <label /> }
			 export function Scene({ row }) @{ <{row} /> }`,
			dev,
		);
		expect(module['value']).toBe('kept');
		expect(render(module['Scene'], { row: module['Label'] })[0].tag).toBe('label');
	});

	it('rejects a literal host name in a computed component tag', () => {
		expect(() => fixture('export function Scene() @{ <{"view"} /> }', dev)).toThrow(/descriptor/);
	});

	it.each(['props.Component', '{props[props.name]}'])(
		'keys <%s /> by its descriptor and reads it before prop spreads',
		(tag) => {
			const { module, render, keys } = fixture(
				`export function First(props) @{ <label value={props.value} /> }
			 export function Second(props) @{ <badge value={props.value} /> }
			 export function Scene(props) @{ <${tag} {...props.spread()} /> }`,
				dev,
			);
			const order: string[] = [];
			let selected = module['First'];
			const props = {
				name: 'Component',
				get Component() {
					order.push('component');
					return selected;
				},
				spread() {
					order.push('spread');
					return { value: 'visible' };
				},
			};
			expect(render(module['Scene'], props)[0]).toMatchObject({
				tag: 'label',
				props: { value: 'visible' },
			});
			expect(render(module['Scene'], props)[0].tag).toBe('label');
			selected = module['Second'];
			expect(render(module['Scene'], props)[0].tag).toBe('badge');
			expect(keys[0]).toBe(keys[1]);
			expect(keys[2]).not.toBe(keys[1]);
			expect(order).toEqual(['component', 'spread', 'component', 'spread', 'component', 'spread']);
		},
	);

	it('rejects an adapter without ABI 4 before component registration', () => {
		expect(() => fixture('export function Scene() @{ <view /> }', dev, 3)).toThrow(
			/Unsupported writer ABI 4/,
		);
	});

	it('rejects nested JSX component declarations that cannot be registered', () => {
		expect(() =>
			fixture('export function Scene() @{ function Local() @{ <view /> } <Local /> }', dev),
		).toThrow(/nested component declarations|JSX in JavaScript setup/);
	});

	it.each([
		`function row(value, read) {
			log.push(value);
			if (!value) return null;
			return <label value={read(value)} />;
		}`,
		`const row = (value, read) => @{
			log.push(value);
			if (!value) return null;
			<label value={read(value)} />
		};`,
	])('runs helper setup at the call and resolves its JSX at each outlet', (declaration) => {
		const { module, render } = fixture(
			`export const log = [];
			 ${declaration}
			 function Slots(props) @{ <view>{props.child}{props.child}</view> }
			 export function Scene(props) @{
				const empty = row('', props.read);
				const child = row(props.label, props.read);
				log.push(empty === null);
				<Slots child={child} />
			 }`,
			dev,
		);
		const log = module['log'] as unknown[];
		const read = (value: string) => {
			log.push('read');
			return value;
		};
		const view = render(module['Scene'], { label: 'visible', read })[0];
		expect(log).toEqual(['', 'visible', true, 'read', 'read']);
		expect(view.children.map((child) => child.props['value'])).toEqual(['visible', 'visible']);
	});

	it('renders a local template body in a fragment and passes it as a callable prop', () => {
		const { module, render } = fixture(
			`function prefix() @{ <prefix /> }
			 function Slot(props) @{ <frame>{props.render()}</frame> }
			 export function Scene(props) @{
				const fallback = () => @{ <label value={props.value} /> };
				<view>{prefix}<>{fallback}</><Slot render={fallback} /></view>
			 }`,
			dev,
		);
		for (const value of ['first', 'second']) {
			const [prefix, direct, slot] = render(module['Scene'], { value })[0].children;
			expect(prefix.tag).toBe('prefix');
			expect(direct).toMatchObject({ tag: 'label', props: { value } });
			expect(slot.children[0]).toMatchObject({ tag: 'label', props: { value } });
		}
	});

	it('renders a module helper among component children and forwards a lone expression as a prop', () => {
		const { module, render } = fixture(
			`function prefix() @{ <prefix /> }
			 function Group(props) @{ <group>{props.children}</group> }
			 function Slot(props) @{ <frame>{props.children()}</frame> }
			 export function Scene() @{
				<view>
					<Group>{prefix}<suffix /></Group>
					<Slot>
						{/* callback */}
						{prefix}
					</Slot>
				</view>
			 }`,
			dev,
		);
		const [group, slot] = render(module['Scene'], {})[0].children;
		expect(group.children.map((child) => child.tag)).toEqual(['prefix', 'suffix']);
		expect(slot.children.map((child) => child.tag)).toEqual(['prefix']);
	});

	it('preserves a lowercase descriptor and its alias when a local helper shadows it', () => {
		const { module, render } = fixture(
			`function row(props) @{ <label value={props.label} /> }
			 const Item = row;
			 export { row as Row };
			 export function Scene() @{
				function row(name) { return <badge value={name} />; }
				<view><Item label="tag" />{row('helper')}</view>
			 }`,
			dev,
		);
		expect(render(module['Row'], { label: 'export' })[0].props['value']).toBe('export');
		expect(render(module['Scene'], {})[0].children).toMatchObject([
			{ tag: 'label', props: { value: 'tag' } },
			{ tag: 'badge', props: { value: 'helper' } },
		]);
	});

	it('renders JSX returned by inline and named map callbacks', () => {
		const { module, render } = fixture(
			`function label(value) { return <label value={value} />; }
			 export function Scene(props) @{
				const badges = props.items.map(value => <badge value={value} />);
				<view>{props.items.map(label)}{badges}{props.items.map(value => <icon value={value} />)}</view>
			 }`,
			dev,
		);
		const [view] = render(module['Scene'], { items: ['a', 'b'] });
		expect(view.children.map((node) => [node.tag, node.props['value']])).toEqual([
			['label', 'a'],
			['label', 'b'],
			['badge', 'a'],
			['badge', 'b'],
			['icon', 'a'],
			['icon', 'b'],
		]);
	});
});
