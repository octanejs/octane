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
import { loadServerFixture } from './_server-fixture.js';
import * as client from './_fixtures/for-bare-binding.tsrx';
import { Rows, type RowsProps } from './_fixtures/for-bare-binding.object.tsrx';

// `@for (item of items)` declares each row's own item, as a `let` header does.
// The same fixture runs through the development and production compilers, on
// the client, on the server, and through hydration and split `<Hydrate>`.

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/for-bare-binding.tsrx',
);
// A split child loads through Vite's real module graph, which can take longer
// than vi.waitFor's 1s default on a loaded runner.
const SPLIT_CHILD_LOAD = { timeout: 4000 };

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
		expect([...host.querySelectorAll('button')]).toEqual(buttons);
		flushSync(() => buttons[1].click());
		expect(picks).toEqual(['y:untitled']);
		expect(buttons[1].textContent).toBe('untitled 1');
		expect(errors).toEqual([]);
	});

	it.each([
		['wraps the rows', 'SplitAroundRows', 'row:b'],
		['sits inside each row', 'SplitInsideRows', 'label:b'],
	] as const)('hydrates a split <Hydrate> that %s', async (_, view, pick) => {
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

		expect([...host.querySelectorAll('button')]).toEqual(buttons);
		expect(text(buttons)).toEqual(['a', 'b']);
		await act(() => buttons[1].click());
		expect(picks).toEqual([pick]);
		expect(errors).toEqual([]);
	});

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
