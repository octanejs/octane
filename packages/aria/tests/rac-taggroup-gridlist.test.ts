import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	DynamicGridListHarness,
	DynamicTagGroupHarness,
	EmptyGridListHarness,
	EmptyTagGroupHarness,
	LoadMoreGridListHarness,
	StaticGridListHarness,
	StaticTagGroupHarness,
} from './_fixtures/rac-taggroup-gridlist.tsx';

// @octanejs/aria Phase 5 — RAC TagGroup (TagGroup / TagList / Tag) and GridList
// (GridList / GridListItem / GridListLoadMoreItem) over the Phase-4 collection
// engine, driven through octane's NATIVE delegated events. Structural collection
// updates land one microtask after commit (the Document's MutationObserver) —
// flush with `await act(() => {})` before asserting.

// jsdom lacks CSS.escape (pulled in transitively by the interaction utilities).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// jsdom lacks Element#getAnimations; the animation-aware components treat an empty
// animation list as "no animation" and complete immediately. jsdom also lacks
// IntersectionObserver, which the load-more sentinel constructs in a layout effect;
// a no-op stand-in keeps the sentinel contract observable without scroll mechanics.
const realIntersectionObserver = (globalThis as any).IntersectionObserver;
beforeAll(() => {
	(Element.prototype as any).getAnimations = () => [];
	(globalThis as any).IntersectionObserver = class {
		observe(): void {}
		unobserve(): void {}
		disconnect(): void {}
		takeRecords(): any[] {
			return [];
		}
	};
});
afterAll(() => {
	delete (Element.prototype as any).getAnimations;
	(globalThis as any).IntersectionObserver = realIntersectionObserver;
});

// Strict per-test unmounts: a leaked mount (and its collection MutationObserver)
// cascades failures into later tests, so every mount goes through this tracker and
// is torn down even when an assertion fails mid-test.
const mounted: Array<{ unmount: () => void }> = [];
function mountTracked(Component: any, props: any): ReturnType<typeof mount> {
	const r = mount(Component, props);
	const unmount = r.unmount.bind(r);
	let done = false;
	r.unmount = () => {
		if (!done) {
			done = true;
			unmount();
		}
	};
	mounted.push(r);
	return r;
}
afterEach(() => {
	while (mounted.length) {
		mounted.pop()!.unmount();
	}
});

function pointerEvent(type: string, init: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		button: 0,
		pointerId: 1,
		pointerType: 'mouse',
		width: 20,
		height: 20,
		pressure: 0.5,
		detail: 1,
		...init,
	});
}

async function press(el: Element): Promise<void> {
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
	});
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerup', { clientX: 5, clientY: 5 }));
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
	});
}

function keydown(el: Element, key: string, init: KeyboardEventInit = {}): void {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

type Mounted = ReturnType<typeof mount>;

function grid(r: Mounted): HTMLElement {
	return r.container.querySelector('[role="grid"]') as HTMLElement;
}

function rows(r: Mounted): HTMLElement[] {
	return [...r.container.querySelectorAll('[role="row"]')] as HTMLElement[];
}

describe('@octanejs/aria/components — TagGroup', () => {
	it('renders a labelled grid of tag rows with gridcells and default classNames', async () => {
		const r = mountTracked(StaticTagGroupHarness, {
			selectionMode: 'multiple',
			disabledKeys: ['gaming'],
		});
		await act(() => {});

		const group = r.container.querySelector('.react-aria-TagGroup') as HTMLElement;
		expect(group).toBeTruthy();

		// The visible label renders as a span (LabelContext elementType) and labels the grid.
		const label = r.container.querySelector('.react-aria-Label') as HTMLElement;
		expect(label.tagName).toBe('SPAN');
		expect(label.textContent).toBe('Categories');
		const list = grid(r);
		expect(list.className).toBe('react-aria-TagList');
		expect(list.getAttribute('aria-labelledby')).toBe(label.id);

		const tagRows = rows(r);
		expect(tagRows.length).toBe(3);
		expect(tagRows.map((t) => t.textContent!.trim())).toEqual(['News', 'Travel', 'Gaming']);
		expect(tagRows[0].className).toBe('react-aria-Tag');
		expect(tagRows[0].getAttribute('data-selection-mode')).toBe('multiple');
		// Each tag row wraps its content in a display:contents gridcell.
		const cell = tagRows[0].querySelector('[role="gridcell"]') as HTMLElement;
		expect(cell).toBeTruthy();
		expect(cell.style.display).toBe('contents');
		// Disabled keys surface as aria-disabled + data-disabled.
		expect(tagRows[2].getAttribute('aria-disabled')).toBe('true');
		expect(tagRows[2].getAttribute('data-disabled')).toBe('true');
		expect(tagRows[0].hasAttribute('data-disabled')).toBe(false);
		// Without onRemove, tags do not advertise removal.
		expect(tagRows[0].hasAttribute('data-allows-removing')).toBe(false);
	});

	it('toggles multiple selection across tags with data-selected + aria-selected', async () => {
		const log: any[] = [];
		const r = mountTracked(StaticTagGroupHarness, {
			selectionMode: 'multiple',
			onSelectionChange: (keys: any) => log.push([...keys].sort()),
		});
		await act(() => {});

		const [news, travel] = rows(r);
		await press(news);
		await press(travel);
		await act(() => {});

		expect(log[log.length - 1]).toEqual(['news', 'travel']);
		expect(news.getAttribute('data-selected')).toBe('true');
		expect(news.getAttribute('aria-selected')).toBe('true');
		expect(travel.getAttribute('data-selected')).toBe('true');

		// Toggle behavior: pressing a selected tag deselects only that tag.
		await press(news);
		await act(() => {});
		expect(log[log.length - 1]).toEqual(['travel']);
		expect(news.hasAttribute('data-selected')).toBe(false);
		expect(news.getAttribute('aria-selected')).toBe('false');
		expect(travel.getAttribute('data-selected')).toBe('true');
	});

	it('removes a tag through the remove Button slot (onRemove receives the key set)', async () => {
		const onRemove = vi.fn();
		const r = mountTracked(StaticTagGroupHarness, { onRemove });
		await act(() => {});

		const tagRows = rows(r);
		// With onRemove provided, tags advertise removal.
		expect(tagRows[0].getAttribute('data-allows-removing')).toBe('true');

		const removeButton = tagRows[1].querySelector('button') as HTMLButtonElement;
		expect(removeButton).toBeTruthy();
		expect(removeButton.getAttribute('aria-label')).toBeTruthy();
		await press(removeButton);
		await act(() => {});

		// onRemove receives a Set of keys (single-arg contract).
		expect(onRemove).toHaveBeenCalledTimes(1);
		expect([...onRemove.mock.calls[0][0]]).toEqual(['travel']);
	});

	it('removes tags with the keyboard (Delete) and updates dynamic items', async () => {
		const onRemove = vi.fn();
		const r = mountTracked(DynamicTagGroupHarness, { onRemove });
		await act(() => {});

		const texts = () => rows(r).map((t) => (t.textContent ?? '').replace(/x$/, '').trim());
		expect(texts()).toEqual(['News', 'Travel', 'Gaming']);

		// Focus the first tag row and delete it with the keyboard.
		const list = grid(r);
		await act(() => list.focus());
		expect((document.activeElement as HTMLElement).getAttribute('role')).toBe('row');
		await act(() => keydown(document.activeElement!, 'Delete'));
		// Structural collection updates land one microtask after commit.
		await act(() => {});

		expect([...onRemove.mock.calls[0][0]]).toEqual(['news']);
		expect(texts()).toEqual(['Travel', 'Gaming']);

		// The remove button removes another item from the dynamic list.
		const removeButton = rows(r)[1].querySelector('button') as HTMLButtonElement;
		await press(removeButton);
		await act(() => {});
		expect(texts()).toEqual(['Travel']);
	});

	it('renders the empty state through renderEmptyState with role=group + data-empty', async () => {
		const r = mountTracked(EmptyTagGroupHarness, {});
		await act(() => {});

		// An empty tag group demotes the grid role to group (useTagGroup contract).
		const list = r.container.querySelector('.react-aria-TagList') as HTMLElement;
		expect(list.getAttribute('role')).toBe('group');
		expect(list.getAttribute('data-empty')).toBe('true');
		expect(list.textContent).toBe('No tags.');
	});
});

describe('@octanejs/aria/components — GridList', () => {
	it('renders grid/row/gridcell roles with default classNames and data attributes', async () => {
		const r = mountTracked(StaticGridListHarness, {
			selectionMode: 'multiple',
			disabledKeys: ['two'],
		});
		await act(() => {});

		const list = grid(r);
		expect(list).toBeTruthy();
		expect(list.className).toBe('react-aria-GridList');
		expect(list.getAttribute('aria-label')).toBe('Favorites');
		expect(list.getAttribute('aria-multiselectable')).toBe('true');
		expect(list.getAttribute('data-layout')).toBe('stack');
		expect(list.getAttribute('data-orientation')).toBe('vertical');
		expect(list.hasAttribute('data-empty')).toBe(false);

		const [one, two] = rows(r);
		expect(rows(r).length).toBe(3);
		expect(one.className).toBe('react-aria-GridListItem');
		expect(one.getAttribute('data-selection-mode')).toBe('multiple');
		expect(one.getAttribute('aria-selected')).toBe('false');
		const cell = one.querySelector('[role="gridcell"]') as HTMLElement;
		expect(cell).toBeTruthy();
		expect(cell.style.display).toBe('contents');
		// Disabled keys surface as aria-disabled + data-disabled on the row.
		expect(two.getAttribute('aria-disabled')).toBe('true');
		expect(two.getAttribute('data-disabled')).toBe('true');
		expect(one.hasAttribute('data-disabled')).toBe(false);
	});

	it('disabledBehavior="all" (default) disables nested row buttons of disabled rows', async () => {
		const r = mountTracked(StaticGridListHarness, {
			selectionMode: 'multiple',
			disabledKeys: ['two'],
		});
		await act(() => {});

		const [one, two] = rows(r);
		// The disabled row's default-slot Button receives isDisabled through ButtonContext.
		const disabledInfo = two.querySelector('button[aria-label="Info Two"]') as HTMLButtonElement;
		expect(disabledInfo.disabled).toBe(true);
		const enabledInfo = one.querySelector('button[aria-label="Info One"]') as HTMLButtonElement;
		expect(enabledInfo.disabled).toBe(false);
		// The disabled row's selection checkbox is disabled too.
		const disabledCheckbox = two.querySelector('input') as HTMLInputElement;
		expect(disabledCheckbox.disabled).toBe(true);
	});

	it('pressing a row toggles multiple selection', async () => {
		const log: any[] = [];
		const r = mountTracked(StaticGridListHarness, {
			selectionMode: 'multiple',
			onSelectionChange: (keys: any) => log.push([...keys].sort()),
		});
		await act(() => {});

		const [one, , three] = rows(r);
		await press(one);
		await press(three);
		await act(() => {});

		expect(log[log.length - 1]).toEqual(['one', 'three']);
		expect(one.getAttribute('data-selected')).toBe('true');
		expect(one.getAttribute('aria-selected')).toBe('true');
		expect(three.getAttribute('data-selected')).toBe('true');

		await press(one);
		await act(() => {});
		expect(log[log.length - 1]).toEqual(['three']);
		expect(one.hasAttribute('data-selected')).toBe(false);
	});

	it('the selection checkbox slot toggles row selection through CheckboxContext', async () => {
		const log: any[] = [];
		const r = mountTracked(StaticGridListHarness, {
			selectionMode: 'multiple',
			onSelectionChange: (keys: any) => log.push([...keys].sort()),
		});
		await act(() => {});

		const [one] = rows(r);
		const input = one.querySelector('input') as HTMLInputElement;
		expect(input.type).toBe('checkbox');
		// The checkbox is labelled by itself + the row (useGridListSelectionCheckbox contract).
		expect(input.getAttribute('aria-labelledby')).toContain(one.id);
		expect(input.checked).toBe(false);

		// Clicking the real input drives selection through the native change event.
		await act(() => {
			input.click();
		});
		await act(() => {});
		expect(log[log.length - 1]).toEqual(['one']);
		expect(input.checked).toBe(true);
		expect(one.getAttribute('data-selected')).toBe('true');

		await act(() => {
			input.click();
		});
		await act(() => {});
		expect(log[log.length - 1]).toEqual([]);
		expect(input.checked).toBe(false);
		expect(one.hasAttribute('data-selected')).toBe(false);
	});

	it('ArrowDown moves real focus between rows with data-focused/data-focus-visible', async () => {
		const r = mountTracked(StaticGridListHarness, { selectionMode: 'multiple' });
		await act(() => {});

		const [one, two] = rows(r);
		const list = grid(r);
		// Focusing the grid forwards focus to the first row.
		await act(() => list.focus());
		expect(document.activeElement).toBe(one);
		expect(one.getAttribute('data-focused')).toBe('true');

		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		expect(document.activeElement).toBe(two);
		expect(two.getAttribute('data-focused')).toBe('true');
		expect(one.hasAttribute('data-focused')).toBe(false);
		// Arrow navigation is keyboard modality: the focused row is focus-visible.
		expect(two.getAttribute('data-focus-visible')).toBe('true');

		await act(() => keydown(document.activeElement!, 'ArrowUp'));
		expect(document.activeElement).toBe(one);
		expect(one.getAttribute('data-focused')).toBe('true');
		expect(two.hasAttribute('data-focused')).toBe(false);
	});

	it('renders dynamic items and preserves DOM identity across a keyed reorder', async () => {
		const r = mountTracked(DynamicGridListHarness, {});
		await act(() => {});

		const texts = () => rows(r).map((o) => o.textContent);
		expect(texts()).toEqual(['Alpha', 'Beta', 'Gamma']);
		const [alpha, beta, gamma] = rows(r);

		await press(beta);
		await act(() => {});
		expect(beta.getAttribute('data-selected')).toBe('true');

		await act(() => {
			(r.container.querySelector('[data-action="reorder"]') as HTMLElement).click();
		});
		// Structural collection updates land one microtask after commit.
		await act(() => {});

		expect(texts()).toEqual(['Gamma', 'Alpha', 'Beta']);
		// Same item objects, new order: the row elements keep DOM identity.
		const reordered = rows(r);
		expect(reordered[0]).toBe(gamma);
		expect(reordered[1]).toBe(alpha);
		expect(reordered[2]).toBe(beta);
		// Selection follows the item through the move.
		expect(reordered[2].getAttribute('data-selected')).toBe('true');
	});

	it('renders the empty state through renderEmptyState with data-empty', async () => {
		const r = mountTracked(EmptyGridListHarness, {});
		await act(() => {});

		const list = grid(r);
		expect(list.getAttribute('data-empty')).toBe('true');
		// The empty state renders inside display:contents row/gridcell wrappers.
		const row = list.querySelector('[role="row"]') as HTMLElement;
		expect(row).toBeTruthy();
		expect(row.style.display).toBe('contents');
		expect(row.getAttribute('aria-rowindex')).toBe('1');
		const cell = row.querySelector('[role="gridcell"]') as HTMLElement;
		expect(cell.style.display).toBe('contents');
		expect(cell.textContent).toBe('No rows found.');
	});

	it('GridListLoadMoreItem always renders its sentinel and gates the spinner row on isLoading', async () => {
		const r = mountTracked(LoadMoreGridListHarness, { isLoading: false });
		await act(() => {});

		// The sentinel is always present (the observed load-more trigger point).
		const sentinel = r.container.querySelector('[data-testid="loadMoreSentinel"]') as HTMLElement;
		expect(sentinel).toBeTruthy();
		// Not loading: only the two item rows render, no spinner row.
		expect(rows(r).length).toBe(2);
		expect(r.container.textContent).not.toContain('Loading more…');
		r.unmount();

		const loading = mountTracked(LoadMoreGridListHarness, { isLoading: true });
		await act(() => {});
		expect(loading.container.querySelector('[data-testid="loadMoreSentinel"]')).toBeTruthy();
		const allRows = rows(loading);
		expect(allRows.length).toBe(3);
		const loaderRow = allRows[2];
		expect(loaderRow.className).toBe('react-aria-GridListLoadingIndicator');
		const loaderCell = loaderRow.querySelector('[role="gridcell"]') as HTMLElement;
		expect(loaderCell.textContent!.trim()).toBe('Loading more…');
	});
});
