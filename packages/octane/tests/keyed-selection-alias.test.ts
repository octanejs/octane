import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import {
	createElement,
	flushSync,
	hydrateRoot,
	startTransition,
	type ComponentBody,
} from '../src/index.js';
import { act, mount } from './_helpers';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
import {
	CapturedSelectionAliasList,
	ControlledKeyAliasList,
	KeyAliasTable,
	MismatchedKeyAliasList,
	OverriddenKeyAliasList,
	RenderableKeyAliasList,
	ReplayKeyAliasList,
	ReverseKeyAliasList,
	ShadowedSelectionAliasList,
	SuspenseKeyAliasTable,
	type AliasRow,
	type AliasSelectionProps,
	type AliasTransitionApi,
	type ReplayAliasProps,
} from './_fixtures/keyed-selection-alias.tsrx';

const fixturePath = 'packages/octane/tests/_fixtures/keyed-selection-alias.tsrx';
const noop = () => {};

function makeRows(): AliasRow[] {
	return [
		{ id: 1, label: 'Alpha' },
		{ id: 2, label: 'Beta' },
		{ id: 3, label: 'Gamma' },
	];
}

function tableRows(container: ParentNode): HTMLTableRowElement[] {
	return Array.from(container.querySelectorAll<HTMLTableRowElement>('tbody > tr'));
}

function selectedLabels(container: ParentNode): Array<string | null> {
	return Array.from(container.querySelectorAll('.selected'), (row) => {
		return row.querySelector('.pick')?.textContent ?? row.textContent;
	});
}

function productionFixture() {
	return loadCompiledFixtureSource<typeof import('./_fixtures/keyed-selection-alias.tsrx')>(
		readFileSync(fixturePath, 'utf8'),
		{ id: fixturePath, mode: 'client', compileOptions: { hmr: false, dev: false } },
	);
}

function catchingBody<P>(body: ComponentBody<P>, errors: unknown[]): ComponentBody<P> {
	return (props, scope, extra) => {
		try {
			body(props, scope, extra);
		} catch (error) {
			errors.push(error);
		}
	};
}

describe('keyed selection with an authored row-key local', () => {
	it('keeps selection, event captures, and keyed nodes current', () => {
		const items = makeRows();
		const picked: number[] = [];
		const removed: number[] = [];
		const props: AliasSelectionProps = {
			items,
			selected: 1,
			onPick: (id) => picked.push(id),
			onRemove: (id) => removed.push(id),
		};
		const rendered = mount(KeyAliasTable, props);
		try {
			const original = tableRows(rendered.container);
			rendered.click('[data-id="3"] .pick');
			expect(picked).toEqual([3]);
			rendered.update(KeyAliasTable, { ...props, selected: 3 });
			expect(selectedLabels(rendered.container)).toEqual(['Gamma']);
			rendered.update(KeyAliasTable, { ...props, selected: 2 });
			expect(selectedLabels(rendered.container)).toEqual(['Beta']);
			expect(tableRows(rendered.container)).toEqual(original);
			rendered.click('[data-id="1"] .remove');
			expect(removed).toEqual([1]);

			const nextPicked: number[] = [];
			rendered.update(KeyAliasTable, {
				...props,
				selected: 2,
				onPick: (id) => nextPicked.push(id),
			});
			rendered.click('[data-id="3"] .pick');
			expect(picked).toEqual([3]);
			expect(nextPicked).toEqual([3]);
		} finally {
			rendered.unmount();
		}
	});

	it('preserves selection and survivor identity through source replacement and empty lists', () => {
		const items = makeRows();
		const props: AliasSelectionProps = { items, selected: 1, onPick: noop, onRemove: noop };
		const rendered = mount(KeyAliasTable, props);
		try {
			const original = tableRows(rendered.container);
			rendered.update(KeyAliasTable, { ...props, selected: 2 });
			const updated = [items[2]!, { ...items[1]!, label: 'Beta updated' }, items[0]!];
			rendered.update(KeyAliasTable, { ...props, items: updated, selected: 1 });
			expect(tableRows(rendered.container)).toEqual(original.toReversed());
			expect(rendered.findAll('.pick').map((node) => node.textContent)).toEqual([
				'Gamma',
				'Beta updated',
				'Alpha',
			]);
			expect(selectedLabels(rendered.container)).toEqual(['Alpha']);

			rendered.update(KeyAliasTable, { ...props, items: updated, selected: 2 });
			expect(selectedLabels(rendered.container)).toEqual(['Beta updated']);
			rendered.update(KeyAliasTable, {
				...props,
				items: [updated[0]!, updated[2]!],
				selected: 2,
			});
			expect(tableRows(rendered.container)).toEqual([original[2], original[0]]);
			expect(selectedLabels(rendered.container)).toEqual([]);
			rendered.update(KeyAliasTable, { ...props, items: [], selected: null });
			expect(tableRows(rendered.container)).toEqual([]);
			rendered.update(KeyAliasTable, { ...props, selected: 3 });
			expect(rendered.findAll('.pick').map((node) => node.textContent)).toEqual([
				'Alpha',
				'Beta',
				'Gamma',
			]);
			expect(selectedLabels(rendered.container)).toEqual(['Gamma']);
		} finally {
			rendered.unmount();
		}
	});

	it('uses strict equality for missing, NaN, and signed-zero keys', () => {
		const items = [
			{ id: Number.NaN, label: 'Not a number' },
			{ id: -0, label: 'Zero' },
			{ id: 1, label: 'One' },
		];
		const props: AliasSelectionProps = { items, selected: 1, onPick: noop, onRemove: noop };
		const rendered = mount(KeyAliasTable, props);
		try {
			const original = tableRows(rendered.container);
			for (const selected of [Number.NaN, 99, null]) {
				rendered.update(KeyAliasTable, { ...props, selected });
				expect(selectedLabels(rendered.container)).toEqual([]);
			}
			for (const selected of [-0, +0]) {
				rendered.update(KeyAliasTable, { ...props, selected });
				expect(selectedLabels(rendered.container)).toEqual(['Zero']);
				expect(tableRows(rendered.container)).toEqual(original);
			}
			rendered.update(KeyAliasTable, {
				...props,
				items: [items[2]!, items[0]!, items[1]!],
				selected: Number.NaN,
			});
			expect(tableRows(rendered.container)).toEqual([original[2], original[0], original[1]]);
			expect(selectedLabels(rendered.container)).toEqual([]);
		} finally {
			rendered.unmount();
		}
	});

	it('does not reread a production list when only the sign of zero changes', () => {
		const Body = productionFixture().KeyAliasTable;
		let armed = false;
		const failure = new Error('unchanged zero key was read');
		const items = [
			{
				get id() {
					if (armed) throw failure;
					return 0;
				},
				label: 'Zero',
			},
			{ id: 1, label: 'One' },
		];
		const props: AliasSelectionProps = { items, selected: -0, onPick: noop, onRemove: noop };
		const rendered = mount(Body, props);
		try {
			const original = tableRows(rendered.container);
			armed = true;
			expect(() => rendered.update(Body, { ...props, selected: +0 })).not.toThrow();
			expect(tableRows(rendered.container)).toEqual(original);
			expect(selectedLabels(rendered.container)).toEqual(['Zero']);
			armed = false;
			rendered.update(Body, { ...props, selected: 1 });
			expect(selectedLabels(rendered.container)).toEqual(['One']);
		} finally {
			armed = false;
			rendered.unmount();
		}
	});

	it('matches either comparison operand against the authored custom key', () => {
		const items = [
			{ uuid: 'a', id: 'shared', label: 'Alpha' },
			{ uuid: 'b', id: 'other', label: 'Beta' },
			{ uuid: 'c', id: 'shared', label: 'Gamma' },
		];
		const rendered = mount(ReverseKeyAliasList, { items, selected: 'a' });
		try {
			const original = rendered.findAll('li');
			rendered.update(ReverseKeyAliasList, { items, selected: 'c' });
			expect(selectedLabels(rendered.container)).toEqual(['Gamma']);
			expect(rendered.findAll('li')).toEqual(original);
		} finally {
			rendered.unmount();
		}
	});

	for (const [name, Body] of [
		['a different header key', MismatchedKeyAliasList],
		['an overriding element key', OverriddenKeyAliasList],
	] as const) {
		it(`updates every match when the row local uses ${name}`, () => {
			const items = [
				{ uuid: 'a', id: 'shared', label: 'Alpha' },
				{ uuid: 'b', id: 'other', label: 'Beta' },
				{ uuid: 'c', id: 'shared', label: 'Gamma' },
			];
			const rendered = mount(Body, { items, selected: 'other' });
			try {
				const original = rendered.findAll('li');
				rendered.update(Body, { items, selected: 'shared' });
				expect(selectedLabels(rendered.container)).toEqual(['Alpha', 'Gamma']);
				expect(rendered.findAll('li')).toEqual(original);
			} finally {
				rendered.unmount();
			}
		});
	}

	it('refreshes untouched-row handlers that also capture the selected value', () => {
		const items = makeRows();
		const observed: Array<[number, number | null]> = [];
		const onObserve = (id: number, selected: number | null) => observed.push([id, selected]);
		const rendered = mount(CapturedSelectionAliasList, { items, selected: 1, onObserve });
		try {
			rendered.update(CapturedSelectionAliasList, { items, selected: 2, onObserve });
			rendered.click('[data-id="3"]');
			expect(observed).toEqual([[3, 2]]);
			expect(selectedLabels(rendered.container)).toEqual(['Beta']);
		} finally {
			rendered.unmount();
		}
	});

	it('keeps callback parameters distinct from an outer selection with the same name', () => {
		const items = makeRows();
		const observed: Array<[number, string]> = [];
		const onObserve = (id: number, eventType: string) => observed.push([id, eventType]);
		const rendered = mount(ShadowedSelectionAliasList, { items, selected: 1, onObserve });
		try {
			rendered.update(ShadowedSelectionAliasList, { items, selected: 2, onObserve });
			rendered.click('[data-id="3"]');
			expect(observed).toEqual([[3, 'click']]);
			expect(selectedLabels(rendered.container)).toEqual(['Beta']);
		} finally {
			rendered.unmount();
		}
	});

	it('reasserts controlled values in both rows whose selection changes', () => {
		const items = makeRows();
		const rendered = mount(ControlledKeyAliasList, { items, selected: 1 });
		try {
			const original = rendered.findAll('li');
			const inputs = rendered.findAll('input') as HTMLInputElement[];
			inputs[0]!.focus();
			inputs[0]!.value = 'external edit';
			inputs[1]!.value = 'next external edit';
			rendered.update(ControlledKeyAliasList, { items, selected: 2 });
			expect(inputs.map((input) => input.value)).toEqual(items.map((row) => row.label));
			expect(rendered.findAll('li.selected')).toEqual([original[1]]);
			expect(rendered.findAll('li')).toEqual(original);
			expect(rendered.findAll('input')).toEqual(inputs);
			expect(document.activeElement).toBe(inputs[0]);
		} finally {
			rendered.unmount();
		}
	});

	it('keeps stable render-function children live during selection', () => {
		let first = 'Alpha';
		let second = 'Beta';
		const items = [
			{ id: 1, content: () => createElement('span', { className: 'live-alias-child' }, first) },
			{ id: 2, content: () => createElement('span', { className: 'live-alias-child' }, second) },
			{ id: 3, content: 'Gamma' },
		];
		const rendered = mount(RenderableKeyAliasList, { items, selected: 1 });
		try {
			const original = rendered.findAll('li');
			const children = rendered.findAll('.live-alias-child');
			first = 'Alpha updated';
			second = 'Beta updated';
			rendered.update(RenderableKeyAliasList, { items, selected: 2 });
			expect(rendered.findAll('li').map((row) => row.textContent)).toEqual([
				'Alpha updated',
				'Beta updated',
				'Gamma',
			]);
			expect(rendered.findAll('li.selected')).toEqual([original[1]]);
			expect(rendered.findAll('li')).toEqual(original);
			expect(rendered.findAll('.live-alias-child')).toEqual(children);
		} finally {
			rendered.unmount();
		}
	});

	it('retains the entered production snapshot across synchronous setup reentry', () => {
		const Body = productionFixture().ReplayKeyAliasList as ComponentBody<ReplayAliasProps>;
		let reenter!: (props: ReplayAliasProps) => void;
		const List: ComponentBody<ReplayAliasProps> = (props, scope, extra) => {
			reenter = (next) => Body(next, scope, extra);
			Body(props, scope, extra);
		};
		const props: ReplayAliasProps = { items: makeRows(), selected: 1, before: noop, tail: null };
		const rendered = mount(List, props);
		try {
			const original = rendered.findAll('li');
			rendered.update(List, {
				...props,
				before: () => reenter({ ...props, selected: 2 }),
			});
			expect(rendered.findAll('li')).toEqual(original);
			expect(selectedLabels(rendered.container)).toEqual(['Beta']);
			rendered.update(List, { ...props, selected: 3 });
			expect(selectedLabels(rendered.container)).toEqual(['Gamma']);
		} finally {
			rendered.unmount();
		}
	});

	it('reports an authored key-read error and recovers on an immutable replacement', () => {
		let armed = false;
		const failure = new Error('row key failed');
		const errors: unknown[] = [];
		const Body = catchingBody(ReplayKeyAliasList, errors);
		const items = makeRows();
		items[1] = {
			get id() {
				if (armed) throw failure;
				return 2;
			},
			label: 'Beta',
		};
		const props: ReplayAliasProps = { items, selected: 1, before: noop, tail: null };
		const rendered = mount(Body, props);
		try {
			const original = rendered.findAll('li');
			armed = true;
			rendered.update(Body, { ...props, selected: 2 });
			expect(errors).toEqual([failure]);
			armed = false;
			rendered.update(Body, { ...props, items: makeRows(), selected: 3 });
			expect(rendered.findAll('li')).toEqual(original);
			expect(selectedLabels(rendered.container)).toEqual(['Gamma']);
		} finally {
			armed = false;
			rendered.unmount();
		}
	});

	it('retries an incomplete list after a later renderable throws', () => {
		const errors: unknown[] = [];
		const Body = catchingBody(ReplayKeyAliasList, errors);
		const tailFailure = new Error('later renderable failed');
		const retryFailure = new Error('incomplete list was retried');
		let failTail = false;
		let failLength = false;
		const items = new Proxy(makeRows(), {
			get(target, property, receiver) {
				if (property === 'length' && failLength) throw retryFailure;
				return Reflect.get(target, property, receiver);
			},
		});
		const props: ReplayAliasProps = {
			items,
			selected: 1,
			before: noop,
			tail: () => {
				if (failTail) throw tailFailure;
				return 'Ready';
			},
		};
		const rendered = mount(Body, props);
		try {
			const original = rendered.findAll('li');
			failTail = true;
			rendered.update(Body, { ...props, selected: 2 });
			expect(errors).toEqual([tailFailure]);
			failTail = false;
			failLength = true;
			rendered.update(Body, { ...props, selected: 2 });
			expect(errors).toEqual([tailFailure, retryFailure]);
			failLength = false;
			rendered.update(Body, { ...props, selected: 3 });
			expect(rendered.findAll('li')).toEqual(original);
			expect(selectedLabels(rendered.container)).toEqual(['Gamma']);
			expect(rendered.container.textContent).toContain('Ready');
		} finally {
			failTail = false;
			failLength = false;
			rendered.unmount();
		}
	});

	it('keeps committed rows visible while a later transition sibling suspends', async () => {
		let resolveNext!: (value: string) => void;
		const next = new Promise<string>((resolve) => {
			resolveNext = resolve;
		});
		let api!: AliasTransitionApi;
		const rendered = mount(SuspenseKeyAliasTable, {
			items: makeRows(),
			initialResource: Promise.resolve('Ready'),
			onMounted: (value: AliasTransitionApi) => {
				api = value;
			},
		});
		try {
			await act(() => {});
			const original = tableRows(rendered.container);
			flushSync(() => {
				startTransition(() => {
					api.setSelected(2);
					api.setResource(next);
				});
			});
			expect(selectedLabels(rendered.container)).toEqual(['Alpha']);
			expect(rendered.find('.alias-resource').textContent).toBe('Ready');
			expect(rendered.findAll('[role="status"]')).toEqual([]);
			await act(() => resolveNext('Resolved'));
			expect(tableRows(rendered.container)).toEqual(original);
			expect(selectedLabels(rendered.container)).toEqual(['Beta']);
			expect(rendered.find('.alias-resource').textContent).toBe('Resolved');
			flushSync(() => api.setSelected(3));
			expect(selectedLabels(rendered.container)).toEqual(['Gamma']);
		} finally {
			resolveNext('Resolved');
			await act(() => {});
			rendered.unmount();
		}
	});

	it('adopts server rows and preserves their events and identity after selection', () => {
		const server = loadServerFixture(fixturePath, {
			compileOptions: { hmr: false, dev: false },
		});
		const picked: number[] = [];
		const props: AliasSelectionProps = {
			items: makeRows(),
			selected: 1,
			onPick: (id) => picked.push(id),
			onRemove: noop,
		};
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = ServerRuntime.renderToString(server.KeyAliasTable, props).html;
		const original = tableRows(container);
		const recoveries: unknown[] = [];
		const root = hydrateRoot(container, KeyAliasTable, props, {
			onRecoverableError: (error) => recoveries.push(error),
		});
		try {
			flushSync(() => {});
			expect(tableRows(container)).toEqual(original);
			expect(selectedLabels(container)).toEqual(['Alpha']);
			flushSync(() => root.render(KeyAliasTable, { ...props, selected: 3 }));
			expect(tableRows(container)).toEqual(original);
			expect(selectedLabels(container)).toEqual(['Gamma']);
			flushSync(() => container.querySelector<HTMLAnchorElement>('[data-id="2"] .pick')!.click());
			expect(picked).toEqual([2]);
			expect(recoveries).toEqual([]);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
