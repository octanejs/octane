import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	ControlledTreeHarness,
	DynamicTreeHarness,
	EmptyTreeHarness,
	LoadMoreTreeHarness,
	StaticTreeHarness,
} from './_fixtures/rac-tree.tsx';

// @octanejs/aria Tree/Table phase — RAC Tree components (Tree / TreeItem /
// TreeItemContent / TreeLoadMoreItem) over the Phase-4 collection engine and the
// ported tree hooks (useTree/useTreeItem on the gridlist machinery), driven
// through octane's NATIVE delegated events. Tree flattens its collection by
// expandedKeys: collapsed child rows are NOT rendered, and expanded descendants
// render as flattened role=row siblings. Structural collection updates land one
// microtask after commit (the Document's MutationObserver) — flush with
// `await act(() => {})` before asserting.

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

function treegrid(r: Mounted): HTMLElement {
	return r.container.querySelector('[role="treegrid"]') as HTMLElement;
}

function rows(r: Mounted): HTMLElement[] {
	return [...r.container.querySelectorAll('[role="row"]')] as HTMLElement[];
}

// Rows carry `aria-label` = their textValue (useGridListItem contract), which is a
// chevron-free way to read the flattened row order.
function rowLabels(r: Mounted): (string | null)[] {
	return rows(r).map((row) => row.getAttribute('aria-label'));
}

function chevron(row: HTMLElement): HTMLButtonElement {
	return row.querySelector('button[slot="chevron"]') as HTMLButtonElement;
}

describe('@octanejs/aria/components — Tree + TreeItem + TreeItemContent', () => {
	it('renders role=treegrid with collapsed child rows omitted and full treegrid row ARIA', async () => {
		const r = mountTracked(StaticTreeHarness, {});
		await act(() => {});

		const tree = treegrid(r);
		expect(tree).toBeTruthy();
		expect(tree.className).toBe('react-aria-Tree');
		expect(tree.getAttribute('aria-label')).toBe('Files');
		// Nothing expanded: only the two top-level rows are in the DOM.
		expect(rowLabels(r)).toEqual(['Documents', 'Photos']);

		const [documents, photos] = rows(r);
		expect(documents.className).toBe('react-aria-TreeItem');
		// Treegrid row ARIA: level/posinset/setsize on every row; aria-expanded only
		// on rows with child rows.
		expect(documents.getAttribute('aria-level')).toBe('1');
		expect(documents.getAttribute('aria-posinset')).toBe('1');
		expect(documents.getAttribute('aria-setsize')).toBe('2');
		expect(documents.getAttribute('aria-expanded')).toBe('false');
		expect(documents.getAttribute('data-level')).toBe('1');
		expect(documents.getAttribute('data-has-child-items')).toBe('true');
		expect(documents.hasAttribute('data-expanded')).toBe(false);
		expect(photos.getAttribute('aria-level')).toBe('1');
		expect(photos.getAttribute('aria-posinset')).toBe('2');
		expect(photos.getAttribute('aria-setsize')).toBe('2');
		expect(photos.hasAttribute('aria-expanded')).toBe(false);
		expect(photos.hasAttribute('data-has-child-items')).toBe(false);

		// Each row wraps its content in a display:contents gridcell.
		const cell = documents.querySelector('[role="gridcell"]') as HTMLElement;
		expect(cell).toBeTruthy();
		expect(cell.style.display).toBe('contents');
		expect(cell.textContent!.trim().endsWith('Documents')).toBe(true);

		// The chevron Button slot renders only for rows with child items (render-prop
		// hasChildItems) and is localized + labelled by itself and the row.
		expect(chevron(documents)).toBeTruthy();
		expect(chevron(documents).getAttribute('aria-label')).toBe('Expand');
		expect(chevron(documents).getAttribute('aria-labelledby')).toContain(documents.id);
		expect(chevron(documents).tabIndex).toBe(-1);
		expect(chevron(photos)).toBeNull();
	});

	it('expands and collapses through the chevron button slot, flattening child rows in and out', async () => {
		const expansions: any[] = [];
		const r = mountTracked(StaticTreeHarness, {
			onExpandedChange: (keys: any) => expansions.push([...keys].sort()),
		});
		await act(() => {});

		const documents = rows(r)[0];
		await press(chevron(documents));
		await act(() => {});

		expect(expansions[expansions.length - 1]).toEqual(['documents']);
		expect(documents.getAttribute('aria-expanded')).toBe('true');
		expect(documents.getAttribute('data-expanded')).toBe('true');
		expect(chevron(documents).getAttribute('aria-label')).toBe('Collapse');
		// The child row renders as a flattened SIBLING row, one level deeper.
		expect(rowLabels(r)).toEqual(['Documents', 'Project', 'Photos']);
		const project = rows(r)[1];
		expect(project.getAttribute('aria-level')).toBe('2');
		expect(project.getAttribute('aria-posinset')).toBe('1');
		expect(project.getAttribute('aria-setsize')).toBe('1');
		expect(project.getAttribute('aria-expanded')).toBe('false');

		// Expanding the nested row flattens the third level in.
		await press(chevron(project));
		await act(() => {});
		expect(expansions[expansions.length - 1]).toEqual(['documents', 'project']);
		expect(rowLabels(r)).toEqual(['Documents', 'Project', 'Report', 'Photos']);
		expect(rows(r)[2].getAttribute('aria-level')).toBe('3');

		// Collapsing the root removes the whole expanded subtree from the DOM.
		await press(chevron(documents));
		await act(() => {});
		expect(expansions[expansions.length - 1]).toEqual(['project']);
		expect(documents.getAttribute('aria-expanded')).toBe('false');
		expect(documents.hasAttribute('data-expanded')).toBe(false);
		expect(rowLabels(r)).toEqual(['Documents', 'Photos']);
	});

	it('defaultExpandedKeys pre-flattens the expanded subtree', async () => {
		const r = mountTracked(StaticTreeHarness, {
			defaultExpandedKeys: ['documents', 'project'],
		});
		await act(() => {});

		expect(rowLabels(r)).toEqual(['Documents', 'Project', 'Report', 'Photos']);
		const [documents, project, report] = rows(r);
		expect(documents.getAttribute('aria-expanded')).toBe('true');
		expect(project.getAttribute('aria-expanded')).toBe('true');
		// Report is a leaf: no aria-expanded, no chevron.
		expect(report.hasAttribute('aria-expanded')).toBe(false);
		expect(chevron(report)).toBeNull();
		expect(report.getAttribute('aria-level')).toBe('3');
	});

	it('pressing a parent row toggles expansion when selectionMode is none (implicit onAction)', async () => {
		const r = mountTracked(StaticTreeHarness, {});
		await act(() => {});

		const documents = rows(r)[0];
		await press(documents);
		await act(() => {});
		expect(documents.getAttribute('aria-expanded')).toBe('true');
		expect(rowLabels(r)).toEqual(['Documents', 'Project', 'Photos']);

		await press(documents);
		await act(() => {});
		expect(documents.getAttribute('aria-expanded')).toBe('false');
		expect(rowLabels(r)).toEqual(['Documents', 'Photos']);
	});

	it('controlled expandedKeys: the chevron reports intent without flattening until the prop changes', async () => {
		const expansions: any[] = [];
		const closed = mountTracked(ControlledTreeHarness, {
			expandedKeys: [],
			onExpandedChange: (keys: any) => expansions.push([...keys].sort()),
		});
		await act(() => {});

		expect(rowLabels(closed)).toEqual(['Parent']);
		await press(chevron(rows(closed)[0]));
		await act(() => {});
		// The controlled value did not change, so the DOM stays collapsed.
		expect(expansions[expansions.length - 1]).toEqual(['parent']);
		expect(rowLabels(closed)).toEqual(['Parent']);
		expect(rows(closed)[0].getAttribute('aria-expanded')).toBe('false');
		closed.unmount();

		const open = mountTracked(ControlledTreeHarness, { expandedKeys: ['parent'] });
		await act(() => {});
		expect(rowLabels(open)).toEqual(['Parent', 'Child']);
		expect(rows(open)[0].getAttribute('aria-expanded')).toBe('true');
	});

	it('renders dynamic items through the render function with nested Collections', async () => {
		const r = mountTracked(DynamicTreeHarness, {});
		await act(() => {});

		// defaultExpandedKeys=['fruit'] flattens Fruit's children in; Vegetables stays collapsed.
		expect(rowLabels(r)).toEqual(['Fruit', 'Apple', 'Banana', 'Vegetables']);
		const vegetables = rows(r)[3];
		expect(vegetables.getAttribute('aria-expanded')).toBe('false');

		await press(chevron(vegetables));
		await act(() => {});
		expect(rowLabels(r)).toEqual(['Fruit', 'Apple', 'Banana', 'Vegetables', 'Carrot']);
		expect(rows(r)[4].getAttribute('aria-level')).toBe('2');

		// Appending a new top-level item re-flattens the fresh collection.
		await act(() => {
			(r.container.querySelector('[data-action="add-root"]') as HTMLElement).click();
		});
		await act(() => {});
		expect(rowLabels(r)).toEqual(['Fruit', 'Apple', 'Banana', 'Vegetables', 'Carrot', 'Grains']);
	});

	it('toggles multiple selection through row presses and the checkbox slot', async () => {
		const log: any[] = [];
		const r = mountTracked(StaticTreeHarness, {
			selectionMode: 'multiple',
			defaultExpandedKeys: ['documents'],
			onSelectionChange: (keys: any) => log.push([...keys].sort()),
		});
		await act(() => {});

		const tree = treegrid(r);
		expect(tree.getAttribute('aria-multiselectable')).toBe('true');
		expect(tree.getAttribute('data-selection-mode')).toBe('multiple');

		const [documents, project] = rows(r);
		expect(documents.getAttribute('aria-selected')).toBe('false');
		expect(documents.getAttribute('data-selection-mode')).toBe('multiple');

		// Pressing a row toggles selection (no implicit expand toggle once selectable).
		await press(project);
		await act(() => {});
		expect(log[log.length - 1]).toEqual(['project']);
		expect(project.getAttribute('aria-selected')).toBe('true');
		expect(project.getAttribute('data-selected')).toBe('true');

		// The selection checkbox slot drives selection through CheckboxContext.
		const input = documents.querySelector('input') as HTMLInputElement;
		expect(input.type).toBe('checkbox');
		expect(input.getAttribute('aria-labelledby')).toContain(documents.id);
		expect(input.checked).toBe(false);
		await act(() => {
			input.click();
		});
		await act(() => {});
		expect(log[log.length - 1]).toEqual(['documents', 'project']);
		expect(input.checked).toBe(true);
		expect(documents.getAttribute('data-selected')).toBe('true');

		await act(() => {
			input.click();
		});
		await act(() => {});
		expect(log[log.length - 1]).toEqual(['project']);
		expect(documents.hasAttribute('data-selected')).toBe(false);
	});

	it('ArrowDown moves row focus; ArrowRight expands; ArrowLeft collapses or moves to the parent', async () => {
		const r = mountTracked(StaticTreeHarness, {});
		await act(() => {});

		const documents = rows(r)[0];
		const tree = treegrid(r);
		// Focusing the treegrid forwards focus to the first row.
		await act(() => tree.focus());
		expect(document.activeElement).toBe(documents);
		expect(documents.getAttribute('data-focused')).toBe('true');

		// ArrowRight on a collapsed parent row expands it and keeps focus on the row.
		await act(() => keydown(documents, 'ArrowRight'));
		await act(() => {});
		expect(documents.getAttribute('aria-expanded')).toBe('true');
		expect(document.activeElement).toBe(documents);

		// ArrowDown moves real focus to the newly revealed child row.
		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		const project = rows(r)[1];
		expect(project.getAttribute('aria-label')).toBe('Project');
		expect(document.activeElement).toBe(project);
		expect(project.getAttribute('data-focused')).toBe('true');
		expect(project.getAttribute('data-focus-visible')).toBe('true');
		expect(documents.hasAttribute('data-focused')).toBe(false);

		// ArrowLeft on a collapsed child moves focus back to its parent row.
		await act(() => keydown(project, 'ArrowLeft'));
		await act(() => {});
		expect(document.activeElement).toBe(documents);

		// ArrowLeft on the expanded parent collapses it.
		await act(() => keydown(documents, 'ArrowLeft'));
		await act(() => {});
		expect(documents.getAttribute('aria-expanded')).toBe('false');
		expect(rowLabels(r)).toEqual(['Documents', 'Photos']);
		expect(document.activeElement).toBe(documents);
	});

	it('disabledKeys disables rows, their checkbox slot, and the chevron expand action', async () => {
		const r = mountTracked(StaticTreeHarness, {
			selectionMode: 'multiple',
			disabledKeys: ['documents'],
		});
		await act(() => {});

		const [documents, photos] = rows(r);
		expect(documents.getAttribute('aria-disabled')).toBe('true');
		expect(documents.getAttribute('data-disabled')).toBe('true');
		expect(photos.hasAttribute('data-disabled')).toBe(false);
		const input = documents.querySelector('input') as HTMLInputElement;
		expect(input.disabled).toBe(true);

		// The chevron's onPress guards on the row's disabled state: no expansion.
		await press(chevron(documents));
		await act(() => {});
		expect(documents.getAttribute('aria-expanded')).toBe('false');
		expect(rowLabels(r)).toEqual(['Documents', 'Photos']);

		// Pressing a disabled row selects nothing. Disabled rows are unselectable, so
		// they omit aria-selected entirely (useGridListItem's canSelectItem contract).
		await press(documents);
		await act(() => {});
		expect(documents.hasAttribute('aria-selected')).toBe(false);
		expect(documents.hasAttribute('data-selected')).toBe(false);
	});

	it('renders the empty state through renderEmptyState with data-empty and treegrid row wrappers', async () => {
		const r = mountTracked(EmptyTreeHarness, {});
		await act(() => {});

		const tree = treegrid(r);
		expect(tree.getAttribute('data-empty')).toBe('true');
		const row = tree.querySelector('[role="row"]') as HTMLElement;
		expect(row).toBeTruthy();
		expect(row.style.display).toBe('contents');
		expect(row.getAttribute('aria-level')).toBe('1');
		const cell = row.querySelector('[role="gridcell"]') as HTMLElement;
		expect(cell.style.display).toBe('contents');
		expect(cell.textContent).toBe('No files found.');
	});

	it('TreeLoadMoreItem always renders its sentinel and gates the spinner row on isLoading', async () => {
		const r = mountTracked(LoadMoreTreeHarness, { isLoading: false });
		await act(() => {});

		// The sentinel is always present (the observed load-more trigger point).
		expect(r.container.querySelector('[data-testid="loadMoreSentinel"]')).toBeTruthy();
		// Not loading: only the two item rows render, no spinner row.
		expect(rows(r).length).toBe(2);
		expect(r.container.textContent).not.toContain('Loading more…');
		r.unmount();

		const loading = mountTracked(LoadMoreTreeHarness, { isLoading: true });
		await act(() => {});
		expect(loading.container.querySelector('[data-testid="loadMoreSentinel"]')).toBeTruthy();
		const allRows = rows(loading);
		expect(allRows.length).toBe(3);
		const loaderRow = allRows[2];
		expect(loaderRow.className).toBe('react-aria-TreeLoader');
		expect(loaderRow.getAttribute('aria-level')).toBe('1');
		expect(loaderRow.getAttribute('data-level')).toBe('1');
		const loaderCell = loaderRow.querySelector('[role="gridcell"]') as HTMLElement;
		expect(loaderCell.textContent!.trim()).toBe('Loading more…');
	});
});
