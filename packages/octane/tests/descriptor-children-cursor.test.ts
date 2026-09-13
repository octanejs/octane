import { describe, expect, it } from 'vitest';
import { createElement, createPortal, createRoot, flushSync, hydrateRoot } from '../src/index.js';
import * as ServerRuntime from 'octane/server';
import { act, mount } from './_helpers.js';

type Item = { id: string; label: string };
type Props = { items: Item[]; onPick: (value: string) => void; read?: () => string };

function Rows({ items, onPick, read }: Props) {
	const rows = createElement(
		'div',
		{ 'data-list': '' },
		items.map(({ id, label }) =>
			createElement(
				'div',
				{ key: id, 'data-row': id },
				createElement('input', { defaultValue: label }),
				createElement('button', { onClick: () => onPick(label) }, label),
			),
		),
	);
	return read === undefined ? rows : [rows, createElement(Read, { read })];
}

function Read({ read }: { read: () => string }) {
	return createElement('p', null, read());
}

const items = (...ids: string[]): Item[] => ids.map((id) => ({ id, label: 'label:' + id }));

describe('descriptor host children', () => {
	it.each([false, true])(
		'reorders and replaces owned children around foreign DOM (foreign=%s)',
		(foreign) => {
			const picks: string[] = [];
			const onPick = (value: string) => picks.push(value);
			const root = mount(Rows, { items: items('a', 'b', 'c', 'd'), onPick });
			try {
				const list = root.find('[data-list]');
				const a = root.find('[data-row="a"]');
				const c = root.find('[data-row="c"]');
				const input = a.querySelector('input')!;
				input.value = 'typed';
				const external = document.createElement('em');
				external.textContent = 'foreign';
				if (foreign) list.insertBefore(external, c);
				for (const ids of [
					['d', 'c', 'b', 'a'],
					['x', 'a', 'c', 'y'],
					['c', 'a'],
					['a', 'c'],
				]) {
					root.update(Rows, { items: items(...ids), onPick });
					expect(root.findAll('[data-row]').map((row) => row.getAttribute('data-row'))).toEqual(
						ids,
					);
					expect(root.find('[data-row="a"]')).toBe(a);
					expect(root.find('[data-row="c"]')).toBe(c);
					expect(input.value).toBe('typed');
					if (foreign) expect(external.parentNode).toBe(list);
				}
				root.click('[data-row="a"] button');
				expect(picks).toEqual(['label:a']);
				root.update(Rows, { items: [], onPick });
				expect(root.findAll('[data-row]')).toEqual([]);
				if (foreign) expect(list.firstChild).toBe(external);
			} finally {
				root.unmount();
			}
		},
	);

	it('preserves portal content while owned siblings reverse and grow', () => {
		const onPick = () => {};
		const root = mount(Rows, { items: items('a', 'b', 'c'), onPick });
		const portalHost = document.createElement('div');
		document.body.appendChild(portalHost);
		const portalRoot = createRoot(portalHost);
		try {
			const list = root.find('[data-list]');
			const a = root.find('[data-row="a"]');
			portalRoot.render(() =>
				createPortal(createElement('aside', { 'data-portal': '' }, 'portal'), list),
			);
			const portal = list.querySelector('[data-portal]')!;
			for (const ids of [
				['c', 'b', 'a'],
				['a', 'x', 'c'],
				['x', 'c', 'a'],
			]) {
				root.update(Rows, { items: items(...ids), onPick });
				expect(root.findAll('[data-row]').map((row) => row.getAttribute('data-row'))).toEqual(ids);
				expect(root.find('[data-row="a"]')).toBe(a);
				expect(list.querySelector('[data-portal]')).toBe(portal);
				expect(portal.textContent).toBe('portal');
			}
		} finally {
			portalRoot.unmount();
			portalHost.remove();
			root.unmount();
		}
	});

	it('restores order and events when a later sibling suspends, then commits the retry', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let pending = true;
		const onPick = (value: string) => picks.push(value);
		const picks: string[] = [];
		const root = mount(Rows, { items: items('a', 'b', 'c'), onPick, read: () => 'ready' });
		try {
			const a = root.find('[data-row="a"]');
			const input = a.querySelector('input')!;
			input.value = 'typed';
			root.update(Rows, {
				items: items('c', 'x', 'a'),
				onPick,
				read: () => {
					if (pending) throw gate;
					return 'ready';
				},
			});
			expect(root.findAll('[data-row]').map((row) => row.getAttribute('data-row'))).toEqual([
				'a',
				'b',
				'c',
			]);
			expect(root.find('[data-row="a"]')).toBe(a);
			root.click('[data-row="a"] button');
			expect(picks).toEqual(['label:a']);
			await act(async () => {
				pending = false;
				release();
				await gate;
			});
			expect(root.findAll('[data-row]').map((row) => row.getAttribute('data-row'))).toEqual([
				'c',
				'x',
				'a',
			]);
			expect(root.find('[data-row="a"]')).toBe(a);
			expect(input.value).toBe('typed');
		} finally {
			root.unmount();
		}
	});

	it('adopts server children before reordering them and preserves pre-hydration input', () => {
		const source = items('a', 'b', 'c');
		const onPick = (value: string) => picks.push(value);
		const picks: string[] = [];
		function ServerRows() {
			return ServerRuntime.createElement(
				'div',
				{ 'data-list': '' },
				source.map(({ id, label }) =>
					ServerRuntime.createElement(
						'div',
						{ key: id, 'data-row': id },
						ServerRuntime.createElement('input', { defaultValue: label }),
						ServerRuntime.createElement('button', null, label),
					),
				),
			);
		}
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(ServerRows).html;
		document.body.appendChild(container);
		const a = container.querySelector('[data-row="a"]')!;
		const input = a.querySelector('input')!;
		input.value = 'typed before hydrate';
		const root = hydrateRoot(container, createElement(Rows, { items: source, onPick }));
		try {
			flushSync(() => {});
			expect(container.querySelector('[data-row="a"]')).toBe(a);
			flushSync(() => root.render(Rows, { items: items('c', 'b', 'a'), onPick }));
			expect(
				Array.from(container.querySelectorAll('[data-row]'), (row) => row.getAttribute('data-row')),
			).toEqual(['c', 'b', 'a']);
			expect(container.querySelector('[data-row="a"]')).toBe(a);
			expect(input.value).toBe('typed before hydrate');
			flushSync(() => a.querySelector('button')!.click());
			expect(picks).toEqual(['label:a']);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
