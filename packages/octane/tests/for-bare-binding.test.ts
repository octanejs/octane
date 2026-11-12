import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, flushSync, hydrateRoot } from 'octane';
import { load } from 'octane/hydration';
import { renderToString } from 'octane/server';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	type UniversalComponent,
} from '../src/universal.js';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
import * as client from './_fixtures/for-bare-binding.tsrx';
import { Rows, type RowsProps } from './_fixtures/for-bare-binding.object.tsrx';

// `@for (item of items)` declares each row's own item, as a `let` header does.
// The same fixture runs through the development and production compilers, on
// the client, on the server, and through hydration and split `<Hydrate>`.

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/for-bare-binding.tsrx',
);
// Each Hydrate child is a separate query module that Vite compiles on its first
// request. A loaded run can queue that request behind other files' transforms
// for several seconds, far beyond vi.waitFor's 1s default; the split tests'
// own timeout leaves room for this bound.
const SPLIT_CHILD_LOAD = { timeout: 10_000 };

const cleanups: (() => void)[] = [];
afterEach(() => {
	while (cleanups.length > 0) cleanups.pop()!();
});

function container(html: string) {
	const host = document.createElement('div');
	host.innerHTML = html;
	document.body.appendChild(host);
	cleanups.push(() => host.remove());
	return host;
}

const text = (nodes: Element[]) => nodes.map((node) => node.textContent);

// Hydration keeps the server's nodes, so each one must be the same object.
function expectAdopted(current: Element[], server: Element[]) {
	expect(current).toHaveLength(server.length);
	current.forEach((node, index) => expect(node).toBe(server[index]));
}

describe('bare-left @for row bindings', () => {
	it('binds each row its own name, shadowing the outer one only inside the row', () => {
		const picks: string[] = [];
		const onPick = (value: string) => picks.push(value);
		const view = mount(client.Labels, { labels: ['a', 'b'], onPick });
		cleanups.push(() => view.unmount());
		expect(text(view.findAll('li'))).toEqual(['a@0', 'b@1']);
		expect(view.find('.after').textContent).toBe('outer label');

		const b = view.find('[data-label="b"]');
		view.update(client.Labels, { labels: ['c', 'b', 'a'], onPick });
		expect(text(view.findAll('li'))).toEqual(['c@0', 'b@1', 'a@2']);
		expect(view.find('[data-label="b"]')).toBe(b);
		view.click('[data-label="a"] button');
		expect(picks).toEqual(['a@2']);

		view.update(client.Labels, { labels: [], onPick });
		expect(text(view.findAll('li'))).toEqual(['outer label']);
		expect(view.find('.after').textContent).toBe('outer label');
	});

	it('destructures object and array headers, keeping row state with its key', () => {
		const picks: string[] = [];
		const onPick = (value: string) => picks.push(value);
		const view = mount(client.Rows, { rows: [{ id: 'x', label: 'first' }, { id: 'y' }], onPick });
		cleanups.push(() => view.unmount());
		expect(text(view.findAll('li'))).toEqual(['first 0', 'untitled 0']);

		view.click('[data-id="y"] button');
		view.click('[data-id="y"] button');
		expect(picks).toEqual(['y:untitled', 'y:untitled']);
		view.update(client.Rows, { rows: [{ id: 'y', label: 'renamed' }, { id: 'x' }], onPick });
		expect(text(view.findAll('li'))).toEqual(['renamed 2', 'untitled 0']);
		view.click('[data-id="y"] button');
		expect(picks.at(-1)).toBe('y:renamed');

		const scores = mount(client.Scores, {
			scores: [
				['ann', 3, 4],
				['bo', 5],
			],
		});
		cleanups.push(() => scores.unmount());
		expect(
			scores.findAll('li').map((node) => [node.getAttribute('data-name'), node.textContent]),
		).toEqual([
			['ann', '3,4'],
			['bo', '5'],
		]);
	});

	it.each([
		['inline', client.ReadOnceRows],
		['folded', client.ReadOnceFoldedRows],
	] as const)(
		'%s rows share the destructured value between key selection and output',
		(_, Component) => {
			const row = (prefix: string) => {
				let reads = 0;
				return {
					get id() {
						return `${prefix}-${++reads}`;
					},
				};
			};
			const view = mount(Component, { rows: [row('a'), row('b')], scope: 'list' });
			cleanups.push(() => view.unmount());
			const [a, b] = view.findAll('li');
			expect(text([a, b])).toEqual(['a-1', 'b-1']);

			view.update(Component, { rows: [row('b'), row('a')], scope: 'list' });
			expect(text(view.findAll('li'))).toEqual(['b-1', 'a-1']);
			expectAdopted(view.findAll('li'), [b, a]);
		},
	);

	it('updates a stable keyed row when a newly bound value changes', () => {
		let label = 'first';
		const row = {
			id: 'stable',
			get label() {
				return label;
			},
		};
		const view = mount(client.ReadOnceRows, { rows: [row], scope: 'list' });
		cleanups.push(() => view.unmount());
		const node = view.find('li');
		expect(node.textContent).toBe('first');

		label = 'second';
		view.update(client.ReadOnceRows, { rows: [row], scope: 'list' });
		expect(view.find('li')).toBe(node);
		expect(node.textContent).toBe('second');
	});

	it('updates a copied rest field and reads an inherited getter on its original receiver', () => {
		let caption = 'first';
		const reads: string[] = [];
		const row = {
			id: 'own',
			get rowCaption() {
				reads.push('own');
				return caption;
			},
		};
		const missing = { id: 'missing', fallback: 'inherited' };
		const props = () => ({ rows: [row, missing] });
		const isEnumerable = Object.prototype.propertyIsEnumerable;
		Object.prototype.propertyIsEnumerable = function (key) {
			if (key === 'rowCaption') throw new Error('unexpected call to propertyIsEnumerable');
			return isEnumerable.call(this, key);
		};
		try {
			const view = mount(client.RestFieldRows, { rows: [row] });
			cleanups.push(() => view.unmount());
			const node = view.find('li');
			expect(node.textContent).toBe('first');
			caption = 'second';
			view.update(client.RestFieldRows, { rows: [row] });
			expect(view.find('li')).toBe(node);
			expect(node.textContent).toBe('second');
			Object.defineProperty(Object.prototype, 'rowCaption', {
				configurable: true,
				get(this: { fallback: string }) {
					reads.push(this.fallback);
					return this.fallback;
				},
			});
			view.update(client.RestFieldRows, props());
			const nodes = view.findAll('li');
			expect(text(nodes)).toEqual(['second', 'inherited']);
			missing.fallback = 'new fallback';
			view.update(client.RestFieldRows, props());
			expectAdopted(view.findAll('li'), nodes);
			expect(text(nodes)).toEqual(['second', 'new fallback']);
			expect(reads).toEqual(['own', 'own', 'own', 'inherited', 'own', 'new fallback']);
		} finally {
			Reflect.deleteProperty(Object.prototype, 'rowCaption');
			Object.prototype.propertyIsEnumerable = isEnumerable;
		}
	});

	it('renders changed contents of the same array in a rest-field child hole', () => {
		const row = { id: 'row', content: ['first'] };
		const view = mount(client.RestChildRows, { rows: [row] });
		cleanups.push(() => view.unmount());
		const node = view.find('li');
		expect(node.textContent).toBe('first');
		row.content[0] = 'second';
		view.update(client.RestChildRows, { rows: [row] });
		expect(view.find('li')).toBe(node);
		expect(node.textContent).toBe('second');
	});

	it('switches a literal default to a supplied array without probing its properties', () => {
		const row: { id: string; labels?: string[] } = { id: 'row' };
		const props = () => ({ rows: [row] });
		const view = mount(client.DefaultFieldRows, props());
		cleanups.push(() => view.unmount());
		const node = view.find('li');
		expect(node.textContent).toBe('untitled');
		const reads: PropertyKey[] = [];
		row.labels = new Proxy(['provided'], {
			get(target, key, receiver) {
				reads.push(key);
				return Reflect.get(target, key, receiver);
			},
			getOwnPropertyDescriptor() {
				throw new Error('unexpected array reflection');
			},
		});
		view.update(client.DefaultFieldRows, props());
		view.update(client.DefaultFieldRows, props());
		expect(node.textContent).toBe('provided');
		expect(reads).toEqual(['0']);
		delete row.labels;
		view.update(client.DefaultFieldRows, props());
		expect(view.find('li')).toBe(node);
		expect(node.textContent).toBe('untitled');
	});

	it('adopts a stateful row using the same destructured values as the server', () => {
		const props = () => {
			let reads = 0;
			return {
				rows: [
					{
						id: 'row',
						get label() {
							return `label-${++reads}`;
						},
					},
				],
				onPick: () => {},
			};
		};
		const host = container(renderToString(server.Rows, props()).html);
		const button = host.querySelector('button')!;
		expect(button.textContent).toBe('label-1 0');

		const errors: unknown[] = [];
		const root = hydrateRoot(host, client.Rows, props(), {
			onRecoverableError: (error) => errors.push(error),
		});
		cleanups.push(() => root.unmount());
		flushSync(() => {});
		expect(host.querySelector('button')).toBe(button);
		expect(button.textContent).toBe('label-1 0');
		expect(errors).toEqual([]);
		flushSync(() => button.click());
		expect(button.textContent).toBe('label-1 1');
	});

	it('keeps a default closure in the row binding scope while evaluating the key', () => {
		const props = { rows: [{ id: 1 }] };
		const host = container(renderToString(server.KeyedDefault, props).html);
		const node = host.querySelector('li');
		expect(node?.textContent).toBe('2');

		const root = hydrateRoot(host, client.KeyedDefault, props);
		cleanups.push(() => root.unmount());
		flushSync(() => {});
		expect(host.querySelector('li')).toBe(node);
		expect(node?.textContent).toBe('2');
	});

	it('rejects writing a const destructured key binding on both client and server', () => {
		// Compile directly so the runtime is exercised even without TypeScript checking.
		const source = `
			function Row({ id }) @{ <li>{String(id)}</li> }
			export function List({ rows }) @{
				<ul>@for (const { id } of rows; key id++) { <Row id={id} /> }</ul>
			}
		`;
		const id = 'const-row-key.tsrx';
		const props = { rows: [{ id: 1 }] };
		const { List: ClientList } = loadCompiledFixtureSource(source, { id, mode: 'client' });
		const { List: ServerList } = loadCompiledFixtureSource(source, { id, mode: 'server' });
		expect(() => mount(ClientList, props)).toThrow(TypeError);
		expect(() => renderToString(ServerList, props)).toThrow(TypeError);
	});

	it('server-renders rows and hydrates them in place', () => {
		const props = { rows: [{ id: 'x', label: 'first' }, { id: 'y' }], onPick: () => {} };
		const host = container(renderToString(server.Rows, props).html);
		const buttons = [...host.querySelectorAll('button')];
		expect(text(buttons)).toEqual(['first 0', 'untitled 0']);
		const labels = container(
			renderToString(server.Labels, { labels: ['a', 'b'], onPick: () => {} }).html,
		);
		expect(text([...labels.querySelectorAll('li')])).toEqual(['a@0', 'b@1']);
		expect(labels.querySelector('.after')!.textContent).toBe('outer label');

		const picks: string[] = [];
		const errors: unknown[] = [];
		const root = hydrateRoot(
			host,
			client.Rows,
			{ ...props, onPick: (value: string) => picks.push(value) },
			{ onRecoverableError: (error) => errors.push(error) },
		);
		cleanups.push(() => root.unmount());
		flushSync(() => {});
		expectAdopted([...host.querySelectorAll('button')], buttons);
		flushSync(() => buttons[1].click());
		expect(picks).toEqual(['y:untitled']);
		expect(buttons[1].textContent).toBe('untitled 1');
		expect(errors).toEqual([]);
	});

	it('lets a row reassign its own bare-left binding', () => {
		const picks: string[] = [];
		const onPick = (value: string) => picks.push(value);
		const rows = { rows: [{ id: 'x', label: 'first' }, { id: 'y' }], onPick };
		const scores = {
			scores: [['ann', 3], ['bo']] satisfies [string, number?][],
			factor: 2,
		};
		const relabeled = mount(client.Relabeled, rows);
		cleanups.push(() => relabeled.unmount());
		expect(text(relabeled.findAll('li'))).toEqual(['first!', 'untitled!']);
		// The row's handler reads the reassigned value, not the destructured one.
		relabeled.click('[data-id="y"] button');
		expect(picks).toEqual(['untitled!']);
		relabeled.update(client.Relabeled, {
			rows: [{ id: 'y', label: 'renamed' }, { id: 'x' }],
			onPick,
		});
		expect(text(relabeled.findAll('li'))).toEqual(['renamed!', 'untitled!']);
		relabeled.click('[data-id="y"] button');
		expect(picks).toEqual(['untitled!', 'renamed!']);

		const weighted = mount(client.Weighted, scores);
		cleanups.push(() => weighted.unmount());
		expect(text(weighted.findAll('li'))).toEqual(['ann:6', 'bo:2']);
		weighted.update(client.Weighted, { ...scores, factor: 10 });
		expect(text(weighted.findAll('li'))).toEqual(['ann:30', 'bo:10']);

		const errors: unknown[] = [];
		const options = { onRecoverableError: (error: unknown) => errors.push(error) };
		const relabeledHost = container(renderToString(server.Relabeled, rows).html);
		const relabeledItems = [...relabeledHost.querySelectorAll('li')];
		expect(text(relabeledItems)).toEqual(['first!', 'untitled!']);
		const weightedHost = container(renderToString(server.Weighted, scores).html);
		const weightedItems = [...weightedHost.querySelectorAll('li')];
		expect(text(weightedItems)).toEqual(['ann:6', 'bo:2']);

		const relabeledRoot = hydrateRoot(relabeledHost, client.Relabeled, rows, options);
		cleanups.push(() => relabeledRoot.unmount());
		const weightedRoot = hydrateRoot(weightedHost, client.Weighted, scores, options);
		cleanups.push(() => weightedRoot.unmount());
		flushSync(() => {});
		expectAdopted([...relabeledHost.querySelectorAll('li')], relabeledItems);
		expect(text(relabeledItems)).toEqual(['first!', 'untitled!']);
		flushSync(() => relabeledItems[0].querySelector('button')!.click());
		expect(picks).toEqual(['untitled!', 'renamed!', 'first!']);
		expectAdopted([...weightedHost.querySelectorAll('li')], weightedItems);
		expect(text(weightedItems)).toEqual(['ann:6', 'bo:2']);
		flushSync(() => weightedRoot.render(client.Weighted, { ...scores, factor: 10 }));
		expect(text(weightedItems)).toEqual(['ann:30', 'bo:10']);
		expect(errors).toEqual([]);
	});

	it.each([
		['wraps the rows', 'SplitAroundRows', 'row:b'],
		['sits inside each row', 'SplitInsideRows', 'label:b'],
	] as const)(
		'hydrates a split <Hydrate> that %s',
		async (_, view, pick) => {
			const input = { rows: [{ id: 'a' }, { id: 'b' }], labels: ['a', 'b'] };
			const host = container(
				renderToString(server[view], { ...input, when: load(), onPick: () => {} }).html,
			);
			const buttons = [...host.querySelectorAll('button')];
			expect(text(buttons)).toEqual(['a', 'b']);

			const picks: string[] = [];
			const errors: unknown[] = [];
			const onHydrated = vi.fn();
			const root = hydrateRoot(
				host,
				client[view],
				{ ...input, when: load(), onHydrated, onPick: (value: string) => picks.push(value) },
				{ onRecoverableError: (error) => errors.push(error) },
			);
			cleanups.push(() => root.unmount());
			const boundaries = view === 'SplitAroundRows' ? 1 : 2;
			await vi.waitFor(async () => {
				await act(() => {});
				expect(onHydrated).toHaveBeenCalledTimes(boundaries);
			}, SPLIT_CHILD_LOAD);

			expectAdopted([...host.querySelectorAll('button')], buttons);
			expect(text(buttons)).toEqual(['a', 'b']);
			await act(() => buttons[1].click());
			expect(picks).toEqual([pick]);
			expect(errors).toEqual([]);
		},
		15_000,
	);

	it('binds universal rows the same way', () => {
		const target = createObjectContainer();
		const root = createUniversalRoot(target, createObjectDriver());
		cleanups.push(() => root.unmount());
		// The fixture transform supplies renderer metadata and universal output.
		const ObjectRows = Rows as unknown as UniversalComponent<RowsProps>;
		const rows = () =>
			target.children[0].children.map((row) => [row.props.id, row.props.label, row.props.position]);
		root.render(ObjectRows, { rows: [{ id: 'x', label: 'first' }, { id: 'y' }] });
		expect(rows()).toEqual([
			['x', 'first', 0],
			['y', 'untitled', 1],
		]);
		const [x, y] = target.children[0].children;
		root.render(ObjectRows, { rows: [{ id: 'y' }, { id: 'x', label: 'first' }] });
		expect(rows()).toEqual([
			['y', 'untitled', 0],
			['x', 'first', 1],
		]);
		// Each row's host moves with its key rather than remounting.
		expect(target.children[0].children[0]).toBe(y);
		expect(target.children[0].children[1]).toBe(x);
		expect(target.children[0].props.outer).toBe('outer');
	});
});
