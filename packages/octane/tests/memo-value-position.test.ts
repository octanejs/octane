import { describe, it, expect } from 'vitest';
import { act, mount, flushEffects } from './_helpers';
import {
	createContext,
	createElement,
	flushSync,
	memo,
	startTransition,
	use,
	useContext,
	useDeferredValue,
	useState,
} from '../src/index.js';

// Regression: React.memo's bail lived only in componentSlot (compiled component
// positions) — a memo()'d component rendered as VALUE-POSITION children (provider
// children, `.ts` binding trees via createElement) re-rendered unconditionally, and
// the context-refresh walk missed consumers under a childSlot in ARRAY mode (the
// keyed list lives in an embedded forSlot). Real-world: Radix NavigationMenu's
// convergence relies on React's implicit same-element bailout; the explicit octane
// expression is a memo() pass-through, which silently didn't bail.
const Ctx = createContext<number>(0);
const log: string[] = [];
let bumpFn: ((u: (v: number) => number) => void) | null = null;

const MemoChildren = memo(function MemoChildren(props: any) {
	log.push('memo-body');
	return props.children;
});

function Consumer() {
	const v = useContext(Ctx);
	log.push('consumer:' + v);
	return createElement('span', { id: 'c', children: String(v) });
}

function NonConsumer() {
	log.push('non-consumer');
	return createElement('span', { id: 'nc', children: 'x' });
}

function Provider(props: any) {
	const [n, bump] = useState(0, Symbol.for('mvp.n'));
	bumpFn = bump;
	log.push('provider:' + n);
	return createElement(Ctx, {
		value: n,
		children: createElement(MemoChildren, { children: props.children }),
	});
}

function App() {
	return createElement(Provider, {
		children: [createElement(Consumer, { key: 'c' }), createElement(NonConsumer, { key: 'nc' })],
	});
}

describe('memo at value position (provider children)', () => {
	it('bails on stable children; refreshes ONLY changed-context consumers (React lazy propagation)', () => {
		const r = mount(App as any);
		flushEffects();
		expect(log).toEqual(['provider:0', 'memo-body', 'consumer:0', 'non-consumer']);

		log.length = 0;
		flushSync(() => bumpFn!((x) => x + 1));
		flushEffects();
		// React's canonical ['App','Consumer'] — no 'Indirection', no non-consumer.
		expect(log).toEqual(['provider:1', 'consumer:1']);
		expect(r.find('#c').textContent).toBe('1');
		expect(r.find('#nc').textContent).toBe('x'); // untouched but alive
		r.unmount();
	});
});

// A plain `.ts` binding hands back a fresh descriptor and props object for every
// row on every render, so each surviving memo row must bail on its prop VALUES.
describe('memo rows in a value-position keyed list', () => {
	type Item = { id: number; label: string; value: number };
	type RowProps = Item & { onSelect: () => void };
	const IDS = [0, 1, 2, 3];
	const makeItems = (): Item[] => IDS.map((id) => ({ id, label: 'item ' + id, value: id }));
	const copyItems = (items: Item[], changed = -1): Item[] =>
		items.map((it) => ({ ...it, value: it.id === changed ? it.value + 10 : it.value }));

	const Theme = createContext('t0');
	const renders: string[] = [];
	let compares = 0;
	const select = () => {};
	let setTheme: (theme: string) => void = () => {};
	let setItems: (items: Item[]) => void = () => {};
	let setShow: (show: boolean) => void = () => {};
	let currentItems: Item[] = [];

	function Leaf(props: { id: number }) {
		const theme = useContext(Theme);
		const shown = useDeferredValue(theme, Symbol.for('mvp.list.deferred'));
		renders.push(`leaf:${props.id}:${theme}/${shown}`);
		return createElement('span', { class: 'leaf' }, theme + '/' + shown);
	}
	function RowBody(props: RowProps) {
		renders.push('row:' + props.id);
		return createElement(
			'li',
			{ id: 'row-' + props.id },
			props.label + ':' + props.value,
			createElement(Leaf, { id: props.id }),
		);
	}
	const Row = memo(RowBody);
	// React calls a custom comparator once per memo row and render.
	const ComparedRow = memo(RowBody, (prev, next) => {
		compares++;
		return prev.value === next.value && prev.label === next.label;
	});

	function List(props: { items: Item[]; row: typeof Row }) {
		return createElement(
			'ul',
			null,
			props.items.map((it) =>
				createElement(props.row, {
					key: it.id,
					id: it.id,
					label: it.label,
					value: it.value,
					onSelect: select,
				}),
			),
		);
	}
	function App(props: { show: boolean; row: typeof Row }) {
		const [theme, updateTheme] = useState('t0', Symbol.for('mvp.list.theme'));
		const [items, updateItems] = useState(makeItems, Symbol.for('mvp.list.items'));
		const [show, updateShow] = useState(props.show, Symbol.for('mvp.list.show'));
		setTheme = updateTheme;
		setItems = updateItems;
		setShow = updateShow;
		currentItems = items;
		return createElement(Theme, {
			value: theme,
			children: show ? createElement(List, { items, row: props.row }) : null,
		});
	}
	const rowText = (root: ReturnType<typeof mount>) =>
		root.findAll('li').map((li) => li.textContent);

	it('re-renders only the row whose props changed', () => {
		const root = mount(App, { show: true, row: Row });
		try {
			const rows = root.findAll('li');
			renders.length = 0;
			flushSync(() => setItems(copyItems(currentItems, 2)));
			expect(renders).toEqual(['row:2', 'leaf:2:t0/t0']);
			expect(rowText(root)).toEqual([
				'item 0:0t0/t0',
				'item 1:1t0/t0',
				'item 2:12t0/t0',
				'item 3:3t0/t0',
			]);
			root.findAll('li').forEach((li, i) => expect(li).toBe(rows[i]));

			// The changed row's new props are now its committed props.
			renders.length = 0;
			flushSync(() => setItems(copyItems(currentItems)));
			expect(renders).toEqual([]);
			flushSync(() => setItems(copyItems(currentItems, 2)));
			expect(renders).toEqual(['row:2', 'leaf:2:t0/t0']);
			expect(root.find('#row-2').textContent).toBe('item 2:22t0/t0');
		} finally {
			root.unmount();
		}
	});

	it('asks a custom comparator once per row', () => {
		const root = mount(App, { show: true, row: ComparedRow });
		try {
			compares = 0;
			renders.length = 0;
			flushSync(() => setItems(copyItems(currentItems, 1)));
			expect(compares).toBe(IDS.length);
			expect(renders).toEqual(['row:1', 'leaf:1:t0/t0']);
			expect(root.find('#row-1').textContent).toBe('item 1:11t0/t0');
		} finally {
			root.unmount();
		}
	});

	// Rows mounted by a transition must not lend that priority to a later urgent
	// update: the consumers it refreshes defer like any other urgent render.
	it.each([
		['an urgent mount', (show: () => void) => flushSync(show)],
		['a transition mount', (show: () => void) => flushSync(() => startTransition(show))],
	])(
		'refreshes context consumers under bailed rows at the update priority after %s',
		async (_name, reveal) => {
			const root = mount(App, { show: false, row: Row });
			try {
				reveal(() => setShow(true));
				await act(() => {});
				expect(rowText(root)).toEqual(IDS.map((id) => `item ${id}:${id}t0/t0`));
				const rows = root.findAll('li');

				renders.length = 0;
				flushSync(() => {
					setTheme('t1');
					setItems(copyItems(currentItems));
				});
				expect(renders).toEqual(IDS.map((id) => `leaf:${id}:t1/t0`));
				renders.length = 0;
				await act(() => {});
				expect(renders).toEqual(IDS.map((id) => `leaf:${id}:t1/t1`));
				expect(rowText(root)).toEqual(IDS.map((id) => `item ${id}:${id}t1/t1`));
				root.findAll('li').forEach((li, i) => expect(li).toBe(rows[i]));
			} finally {
				root.unmount();
			}
		},
	);

	it('commits a changed row only after a suspended sibling in a held root resolves', async () => {
		function Reader(props: { promise: PromiseLike<string> }) {
			return createElement('output', null, use(props.promise));
		}
		function Held(props: { items: Item[]; promise: PromiseLike<string> }) {
			return createElement(
				'main',
				null,
				createElement(List, { items: props.items, row: Row }),
				createElement(Reader, { promise: props.promise }),
			);
		}
		let resolve!: (value: string) => void;
		const pending = new Promise<string>((res) => (resolve = res));
		const first = { then() {}, status: 'fulfilled', value: 'first' } as any;
		const items = makeItems();
		const root = mount(Held, { items, promise: first });
		try {
			const rows = root.findAll('li');
			renders.length = 0;
			root.update(Held, { items: copyItems(items, 3), promise: pending });
			expect(rowText(root)).toEqual(IDS.map((id) => `item ${id}:${id}t0/t0`));
			expect(root.find('output').textContent).toBe('first');

			await act(() => resolve('second'));
			expect(rowText(root)).toEqual([
				'item 0:0t0/t0',
				'item 1:1t0/t0',
				'item 2:2t0/t0',
				'item 3:13t0/t0',
			]);
			expect(root.find('output').textContent).toBe('second');
			root.findAll('li').forEach((li, i) => expect(li).toBe(rows[i]));
			expect(renders.filter((entry) => entry.startsWith('row:') && entry !== 'row:3')).toEqual([]);
		} finally {
			root.unmount();
		}
	});
});
