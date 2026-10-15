import { afterEach, describe, expect, it } from 'vitest';
import {
	Fragment,
	createElement,
	createRoot,
	flushSync,
	lazy,
	startTransition,
	useState,
} from 'octane';
import { act } from './_helpers';

// A pure-host de-opt tree that gains a component child upgrades to Blocks by
// adopting its committed nodes (#2043). The render that upgrades it writes
// none of them: the list's markers, the moves of what it adopts and its new
// rows land at commit.

function Inner() {
	return createElement('input', { 'data-testid': 'inner' });
}

function Probe(props: { probe: () => void }) {
	props.probe();
	return null;
}

type Shape = (props: { on: boolean; items: string[] }) => any;

const Flat: Shape = ({ on }) =>
	createElement(
		'form',
		null,
		createElement('p', { 'data-testid': 'p' }, String(on)),
		createElement('button', { 'data-testid': 'btn' }, 'flip'),
		on && createElement(Inner, null),
	);

const Keyed: Shape = ({ on, items }) =>
	createElement(
		'ul',
		null,
		createElement('button', { 'data-testid': 'btn' }, 'grow'),
		items.map((v) => createElement('li', { key: v, 'data-testid': `li-${v}` }, v)),
		on && createElement(Inner, null),
	);

const Nested: Shape = ({ on }) =>
	createElement(
		'section',
		null,
		createElement('button', { 'data-testid': 'btn' }, 'flip'),
		createElement(
			'div',
			{ 'data-testid': 'wrap' },
			createElement('input', { 'data-testid': 'keep' }),
			on && createElement(Inner, null),
		),
	);

const SoleChild: Shape = ({ on }) =>
	createElement(
		'div',
		{ 'data-testid': 'host' },
		on ? createElement(Inner, null) : createElement('span', { 'data-testid': 'raw' }, 'raw'),
	);

const ItemChildren: Shape = ({ on, items }) =>
	createElement(
		'ul',
		null,
		items.map((v) =>
			createElement(
				'li',
				{ key: v, 'data-testid': `li-${v}` },
				createElement('input', { 'data-testid': `keep-${v}` }),
				on && createElement(Inner, null),
			),
		),
	);

let cleanup: (() => void) | null = null;
afterEach(() => {
	cleanup?.();
	cleanup = null;
});

function mountObserved(Shape: Shape, initial: { on: boolean; items: string[] }) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	const observer = new MutationObserver(() => {});
	const during: MutationRecord[][] = [];
	let armed = false;
	const probe = () => {
		if (armed) during.push(observer.takeRecords());
	};
	let set!: (next: { on: boolean; items: string[] }) => void;
	function App() {
		const [state, setState] = useState(initial);
		set = setState;
		return createElement(
			Fragment,
			null,
			createElement(Shape, state),
			createElement(Probe, { probe }),
		);
	}
	flushSync(() => root.render(App, {}));
	observer.observe(container, {
		subtree: true,
		childList: true,
		characterData: true,
		attributes: true,
	});
	cleanup = () => {
		observer.disconnect();
		root.unmount();
		container.remove();
	};
	return {
		container,
		during,
		arm() {
			observer.takeRecords();
			armed = true;
		},
		set: (next: { on: boolean; items: string[] }) => set(next),
		records: () => observer.takeRecords(),
	};
}

const nodes = (container: Element) => [...container.querySelectorAll('*')];

describe('a de-opt host upgrade over committed DOM', () => {
	it.each<[string, Shape, { on: boolean; items: string[] }]>([
		['a flat host', Flat, { on: true, items: [] }],
		['keyed rows that grow', Keyed, { on: true, items: ['a', 'b', 'c'] }],
		['keyed rows that reorder', Keyed, { on: true, items: ['b', 'a'] }],
		['keyed rows that replace one', Keyed, { on: true, items: ['a', 'x'] }],
		['a nested host', Nested, { on: true, items: [] }],
		['a host whose only child becomes a component', SoleChild, { on: true, items: [] }],
		['rows that gain a component child', ItemChildren, { on: true, items: ['a', 'b'] }],
	])('writes nothing during the render that upgrades %s', (_name, Shape, next) => {
		const app = mountObserved(Shape, { on: false, items: ['a', 'b'] });
		const before = nodes(app.container);
		app.arm();
		flushSync(() => app.set(next));
		expect(app.during.length).toBeGreaterThan(0);
		for (const records of app.during) expect(records).toEqual([]);
		expect(app.container.querySelector('[data-testid="inner"]')).not.toBeNull();
		// What survives the upgrade keeps its node.
		for (const node of before) {
			const id = node.getAttribute('data-testid');
			if (
				id === null ||
				id === 'raw' ||
				(id.startsWith('li-') && !next.items.includes(id.slice(3)))
			)
				continue;
			expect(app.container.querySelector(`[data-testid="${id}"]`)).toBe(node);
		}
		if (next.items.length > 0 && Shape === Keyed)
			expect([...app.container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(
				next.items,
			);
	});

	it('leaves the committed host untouched when the upgrading render is dropped', async () => {
		const LazyInner = lazy(() => new Promise<{ default: typeof Inner }>(() => {}));
		const Held: Shape = ({ on, items }) =>
			createElement(
				'ul',
				null,
				createElement('button', { 'data-testid': 'btn' }, 'grow'),
				items.map((v) => createElement('li', { key: v, 'data-testid': `li-${v}` }, v)),
				on && createElement(LazyInner, null),
			);
		const app = mountObserved(Held, { on: false, items: ['a', 'b'] });
		const before = nodes(app.container);
		const html = app.container.innerHTML;
		app.arm();
		await act(() => startTransition(() => app.set({ on: true, items: ['b', 'a', 'c'] })));
		// The transition holds: the screen is the committed one, unwritten.
		for (const records of app.during) expect(records).toEqual([]);
		expect(app.records()).toEqual([]);
		expect(app.container.innerHTML).toBe(html);
		// An urgent update supersedes it, and the held render is dropped.
		await act(() => app.set({ on: false, items: ['a', 'b'] }));
		expect(app.container.innerHTML).toBe(html);
		expect(nodes(app.container)).toEqual(before);
	});
});
