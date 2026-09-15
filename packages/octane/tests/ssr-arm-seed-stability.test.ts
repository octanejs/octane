import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hydrateRoot, flushSync } from '../src/index.js';
import { prerender } from 'octane/static';
import { loadCompiledFixtureSource } from './_server-fixture';

// SSR async arms (@for items, boundary branches) render under per-arm
// identity scopes. A value an arm seeds while suspended must stay bound to
// that arm across reordered and replayed passes — and hydration must adopt
// the seeded DOM — or items silently display each other's content.

const SOURCE = `
	import { use } from 'octane';
	function Row(props) @{
		<li data-id={props.id}>{use(props.value) as string}</li>
	}
	export function List(props) @{
		<ul>
			@for (const item of props.items; key item.id) {
				<Row id={item.id} value={item.value} />
			}
		</ul>
	}
`;

const server = loadCompiledFixtureSource(SOURCE, {
	id: 'arm-seed-stability.tsrx',
	mode: 'server',
});
const client = loadCompiledFixtureSource(SOURCE, {
	id: 'arm-seed-stability.tsrx',
	mode: 'client',
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe('SSR @for arms keep seeded values bound to their item key', () => {
	let container: HTMLElement;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});
	afterEach(() => container.remove());

	it('seeds each suspending @for arm with its own item value', async () => {
		// Ten suspending items under ten distinct arm scopes. The first pass
		// suspends at the first item and unwinds; on the converged pass all
		// ten arms render together, pushing the frame's counter list past its
		// pair-list limit into a Map. A counter that leaked across scopes
		// would misnumber a later arm's first child — or its use() site — and
		// seed the wrong value.
		const items = Array.from({ length: 10 }, (_, i) => {
			const d = deferred<string>();
			return { id: `i${i}`, value: d.promise, resolve: d.resolve };
		});
		const pending = prerender(server.List, { items });
		// Reorder the list between the suspending pass and the converged pass.
		// Each item's deferred slot keeps its own arm scope, so values must
		// stay bound to item keys — a counter that assigned ordinals by visit
		// order instead would drift the replayed keys.
		items.reverse();
		items.forEach((item, i) => item.resolve(`v${i}`));
		const { html } = await pending;

		container.innerHTML = html;
		const expected = items.map((item, i) => [item.id, `v${i}`]);
		const rows = [...container.querySelectorAll('li')];
		expect(rows.map((li) => li.dataset.id)).toEqual(expected.map(([id]) => id));
		expect(rows.map((li) => li.textContent)).toEqual(expected.map(([, v]) => v));

		// Hydrate with never-resolving reads: adoption must reuse the seeded
		// values — if a seed key drifted, the client re-suspends or adopts the
		// wrong arm's content. Identity assertions prove the same nodes were
		// adopted, not merely equivalent markup.
		const root = hydrateRoot(container, client.List, {
			items: items.map(({ id }) => ({ id, value: new Promise<string>(() => {}) })),
		});
		flushSync(() => {});
		const adopted = [...container.querySelectorAll('li')];
		expect(adopted).toHaveLength(rows.length);
		adopted.forEach((li, i) => expect(li).toBe(rows[i]));
		expect(adopted.map((li) => li.textContent)).toEqual(expected.map(([, v]) => v));
		root.unmount();
	});

	it('binds arms keyed by fresh objects to their visit position across a reorder', async () => {
		// Keys recreated every pass have no cross-pass identity, so each arm's
		// scope falls back to its visit position: after the reorder, each slot
		// keeps the arm — and the seeded value — of the item that held it
		// first. This is the one channel where a miscounted arm-position
		// ordinal surfaces in output: two slots reading back the same arm
		// identity would cross-adopt seeds.
		const objectKeyed = loadCompiledFixtureSource(
			`
				import { use } from 'octane';
				function Row(props) @{
					<li data-id={props.id}>{use(props.value) as string}</li>
				}
				export function List(props) @{
					<ul>
						@for (const item of props.ids.map((id) => ({ id })); key item) {
							<Row id={item.id} value={props.values.get(item.id)} />
						}
					</ul>
				}
			`,
			{ id: 'arm-position-keys.tsrx', mode: 'server' },
		);
		const ids = ['a', 'b', 'c'];
		const resolvers = new Map(ids.map((id) => [id, deferred<string>()]));
		const values = new Map(ids.map((id) => [id, resolvers.get(id)!.promise]));
		const pending = prerender(objectKeyed.List, { ids, values });
		ids.reverse();
		resolvers.get('a')!.resolve('va');
		resolvers.get('b')!.resolve('vb');
		resolvers.get('c')!.resolve('vc');
		const { html } = await pending;

		container.innerHTML = html;
		const rows = [...container.querySelectorAll('li')];
		expect(rows.map((li) => li.dataset.id)).toEqual(['c', 'b', 'a']);
		// Slot 0 renders item 'c' under the arm 'a' first occupied, so it
		// adopts 'a's seeded value; later slots enter arms of their own and
		// read their own resolved values.
		expect(rows.map((li) => li.textContent)).toEqual(['va', 'vb', 'va']);
	});

	it('keeps a second-pass replay of the same arm stable when items suspend repeatedly', async () => {
		// Two sequential use() sites in one arm: the second site must see the
		// first site's occurrence bump even after a discovery re-run rewinds and
		// replays the frame's counters.
		const twoReads = loadCompiledFixtureSource(
			`
				import { use } from 'octane';
				function Row(props) @{
					<li data-id={props.id}>{use(props.a) as string}:{use(props.b) as string}</li>
				}
				export function List(props) @{
					<ul>
						@for (const item of props.items; key item.id) {
							<Row id={item.id} a={item.a} b={item.b} />
						}
					</ul>
				}
			`,
			{ id: 'arm-seed-two-reads.tsrx', mode: 'server' },
		);
		const items = ['x', 'y'].map((id) => {
			const a = deferred<string>();
			const b = deferred<string>();
			return { id, a: a.promise, b: b.promise, resolveA: a.resolve, resolveB: b.resolve };
		});
		const pending = prerender(twoReads.List, { items });
		items[1].resolveB('yB');
		items[1].resolveA('yA');
		items[0].resolveB('xB');
		items[0].resolveA('xA');
		const { html } = await pending;

		container.innerHTML = html;
		expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
			'xA:xB',
			'yA:yB',
		]);
	});
});
