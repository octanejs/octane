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
		if (value !== null && typeof value === 'object' && 'render' in value) {
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

	it('registers memo bodies and keeps recursive names local to the default export', () => {
		const { module, render } = fixture(
			`import { memo as cache } from 'octane';
			 export const equal = (a, b) => a.n === b.n;
			 function Row() @{ <badge /> }
			 const Empty = cache(() => null);
			 export const registry = { Empty, Row: cache(Row) };
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
});
