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

	it('uses the dynamic descriptor in component identity and evaluates it before prop spreads', () => {
		const { module, render, keys } = fixture(
			`export function First(props) @{ <label value={props.value} /> }
			 export function Second(props) @{ <badge value={props.value} /> }
			 export function Scene(props) @{ <props.Component {...props.spread()} /> }`,
			dev,
		);
		const order: string[] = [];
		let selected = module['First'];
		const props = {
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
	});

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
