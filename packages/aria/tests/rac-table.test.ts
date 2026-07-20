import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	DynamicTableHarness,
	EmptyTableHarness,
	ResizableTableHarness,
	SelectableTableHarness,
	SortableTableHarness,
	StaticTableHarness,
} from './_fixtures/rac-table.tsx';

// @octanejs/aria Tree/Table phase — RAC Table components (Table / TableHeader /
// TableBody / Column / Row / Cell / ResizableTableContainer / ColumnResizer) over
// the Phase-4 collection engine and the ported table hooks, driven through
// octane's NATIVE delegated events. The Table renders a role=grid <table> whose
// header rows come from the collection's buildHeaderRows pass and whose body rows
// are flattened collection items. Structural collection updates land one
// microtask after commit (the Document's MutationObserver) — flush with
// `await act(() => {})` before asserting. Column-resize pixel math is
// layout-driven (jsdom zero rects), so the resizer assertions cover wiring, aria
// and data attributes — never widths.

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

function columnHeaders(r: Mounted): HTMLElement[] {
	return [...r.container.querySelectorAll('[role="columnheader"]')] as HTMLElement[];
}

function bodyRows(r: Mounted): HTMLElement[] {
	return [...r.container.querySelectorAll('tbody [role="row"]')] as HTMLElement[];
}

function rowTexts(r: Mounted): (string | null)[] {
	return bodyRows(r).map(
		(row) => row.querySelector('[role="rowheader"]')?.textContent?.trim() ?? null,
	);
}

describe('@octanejs/aria/components — Table structure', () => {
	it('renders a role=grid table with columnheader, rowheader and gridcell structure', async () => {
		const r = mountTracked(StaticTableHarness, {});
		await act(() => {});

		const table = grid(r);
		expect(table).toBeTruthy();
		expect(table.tagName).toBe('TABLE');
		expect(table.className).toBe('react-aria-Table');
		expect(table.getAttribute('aria-label')).toBe('Files');

		// TableHeader renders a thead rowgroup with a single header row of columns.
		const thead = table.querySelector('thead') as HTMLElement;
		expect(thead.getAttribute('role')).toBe('rowgroup');
		expect(thead.className).toBe('react-aria-TableHeader');
		const headerRows = [...thead.querySelectorAll('[role="row"]')];
		expect(headerRows.length).toBe(1);
		const headers = columnHeaders(r);
		expect(headers.length).toBe(3);
		expect(headers.map((h) => h.textContent?.trim())).toEqual(['Name', 'Type', 'Date Modified']);
		expect(headers[0].tagName).toBe('TH');
		expect(headers[0].className).toBe('react-aria-Column');

		// TableBody renders a tbody rowgroup of rows; the isRowHeader column's cell
		// is a rowheader, the rest are gridcells.
		const tbody = table.querySelector('tbody') as HTMLElement;
		expect(tbody.getAttribute('role')).toBe('rowgroup');
		expect(tbody.className).toBe('react-aria-TableBody');
		const rows = bodyRows(r);
		expect(rows.length).toBe(2);
		expect(rows[0].className).toBe('react-aria-Row');
		expect(rows[0].getAttribute('data-level')).toBe('1');

		const firstRowCells = [...rows[0].querySelectorAll('td')] as HTMLElement[];
		expect(firstRowCells.length).toBe(3);
		expect(firstRowCells[0].getAttribute('role')).toBe('rowheader');
		expect(firstRowCells[0].className).toBe('react-aria-Cell');
		expect(firstRowCells[0].textContent?.trim()).toBe('Games');
		expect(firstRowCells[1].getAttribute('role')).toBe('gridcell');
		expect(firstRowCells[2].getAttribute('role')).toBe('gridcell');

		// The rowheader cell carries a deterministic id that labels its row.
		const rowHeaderId = firstRowCells[0].id;
		expect(rowHeaderId).toBeTruthy();
		expect(rows[0].getAttribute('aria-labelledby')).toContain(rowHeaderId);

		// Not virtualized: no 1-based aria row/col annotations on the table.
		expect(table.hasAttribute('aria-rowcount')).toBe(false);
		expect(table.hasAttribute('aria-colcount')).toBe(false);
	});

	it('renders dynamic collections through columns={} and items={} render functions', async () => {
		const r = mountTracked(DynamicTableHarness, {});
		await act(() => {});

		expect(columnHeaders(r).map((h) => h.textContent?.trim())).toEqual(['Name', 'Type']);
		expect(rowTexts(r)).toEqual(['Alpha', 'Beta', 'Gamma']);
		// Each dynamic row renders one cell per column entry.
		const rows = bodyRows(r);
		expect(rows[0].querySelectorAll('td').length).toBe(2);
		expect(rows[1].querySelector('[role="gridcell"]')?.textContent?.trim()).toBe('Folder');
	});

	it('adds and removes rows through the items collection', async () => {
		const r = mountTracked(DynamicTableHarness, {});
		await act(() => {});

		await act(() => {
			(r.container.querySelector('[data-action="add"]') as HTMLElement).click();
		});
		await act(() => {});
		expect(rowTexts(r)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);

		await act(() => {
			(r.container.querySelector('[data-action="remove"]') as HTMLElement).click();
		});
		await act(() => {});
		expect(rowTexts(r)).toEqual(['Alpha', 'Gamma', 'Delta']);
	});

	it('preserves row DOM identity (and selection) across a keyed reorder', async () => {
		const r = mountTracked(DynamicTableHarness, {});
		await act(() => {});

		expect(rowTexts(r)).toEqual(['Alpha', 'Beta', 'Gamma']);
		const [alpha, beta, gamma] = bodyRows(r);

		await press(beta);
		await act(() => {});
		expect(beta.getAttribute('data-selected')).toBe('true');

		await act(() => {
			(r.container.querySelector('[data-action="reorder"]') as HTMLElement).click();
		});
		// Structural collection updates land one microtask after commit.
		await act(() => {});

		expect(rowTexts(r)).toEqual(['Gamma', 'Alpha', 'Beta']);
		// Same item objects, new order: the row elements keep DOM identity.
		const reordered = bodyRows(r);
		expect(reordered[0]).toBe(gamma);
		expect(reordered[1]).toBe(alpha);
		expect(reordered[2]).toBe(beta);
		// Selection follows the item through the move.
		expect(reordered[2].getAttribute('data-selected')).toBe('true');
	});

	it('renderEmptyState renders a full-width rowheader when the table has no rows', async () => {
		const r = mountTracked(EmptyTableHarness, {});
		await act(() => {});

		const tbody = grid(r).querySelector('tbody') as HTMLElement;
		expect(tbody.getAttribute('data-empty')).toBe('true');
		const emptyRow = tbody.querySelector('[role="row"]') as HTMLElement;
		expect(emptyRow).toBeTruthy();
		const emptyCell = emptyRow.querySelector('[role="rowheader"]') as HTMLTableCellElement;
		expect(emptyCell.textContent?.trim()).toBe('No results: true');
		// Spans every column of the table.
		expect(emptyCell.colSpan).toBe(2);
	});
});

describe('@octanejs/aria/components — Table sorting', () => {
	it('column presses cycle the sortDescriptor and reflect aria-sort', async () => {
		const log: any[] = [];
		const r = mountTracked(SortableTableHarness, {
			onSortChange: (descriptor: any) => log.push(descriptor),
		});
		await act(() => {});

		const [name, type, date] = columnHeaders(r);
		// Sortable columns expose aria-sort (initially none); non-sortable omit it.
		expect(name.getAttribute('aria-sort')).toBe('none');
		expect(name.getAttribute('data-allows-sorting')).toBe('true');
		expect(type.getAttribute('aria-sort')).toBe('none');
		expect(date.hasAttribute('aria-sort')).toBe(false);
		expect(date.hasAttribute('data-allows-sorting')).toBe(false);

		await press(name);
		await act(() => {});
		expect(log[log.length - 1]).toEqual({ column: 'name', direction: 'ascending' });
		expect(name.getAttribute('aria-sort')).toBe('ascending');
		expect(name.getAttribute('data-sort-direction')).toBe('ascending');

		// Pressing the sorted column flips the direction.
		await press(name);
		await act(() => {});
		expect(log[log.length - 1]).toEqual({ column: 'name', direction: 'descending' });
		expect(name.getAttribute('aria-sort')).toBe('descending');
		expect(name.getAttribute('data-sort-direction')).toBe('descending');

		// Sorting another column resets the previous one to none.
		await press(type);
		await act(() => {});
		expect(log[log.length - 1]).toEqual({ column: 'type', direction: 'ascending' });
		expect(type.getAttribute('aria-sort')).toBe('ascending');
		expect(name.getAttribute('aria-sort')).toBe('none');
		expect(name.hasAttribute('data-sort-direction')).toBe(false);
	});
});

describe('@octanejs/aria/components — Table selection', () => {
	it('toggles multiple selection through row presses and the checkbox slot', async () => {
		const log: any[] = [];
		const r = mountTracked(SelectableTableHarness, {
			onSelectionChange: (keys: any) => log.push(keys === 'all' ? 'all' : [...keys].sort()),
		});
		await act(() => {});

		const table = grid(r);
		expect(table.getAttribute('aria-multiselectable')).toBe('true');

		const [alpha, beta] = bodyRows(r);
		expect(alpha.getAttribute('aria-selected')).toBe('false');
		expect(alpha.getAttribute('data-selection-mode')).toBe('multiple');
		// Row className render prop observes isSelected.
		expect(alpha.className).toBe('row');

		// Pressing a row toggles selection.
		await press(alpha);
		await act(() => {});
		expect(log[log.length - 1]).toEqual(['alpha']);
		expect(alpha.getAttribute('aria-selected')).toBe('true');
		expect(alpha.getAttribute('data-selected')).toBe('true');
		expect(alpha.className).toBe('row selected');

		// The selection checkbox slot drives selection through CheckboxContext. It is
		// labelled by itself + the row's rowheader cell (getRowLabelledBy contract).
		const betaCheckbox = beta.querySelector('input') as HTMLInputElement;
		const betaRowHeader = beta.querySelector('[role="rowheader"]') as HTMLElement;
		expect(betaCheckbox.type).toBe('checkbox');
		expect(betaRowHeader.id).toBeTruthy();
		expect(betaCheckbox.getAttribute('aria-labelledby')).toContain(betaRowHeader.id);
		expect(betaCheckbox.checked).toBe(false);
		await act(() => {
			betaCheckbox.click();
		});
		await act(() => {});
		expect(log[log.length - 1]).toEqual(['alpha', 'beta']);
		expect(betaCheckbox.checked).toBe(true);
		expect(beta.getAttribute('data-selected')).toBe('true');

		await act(() => {
			betaCheckbox.click();
		});
		await act(() => {});
		expect(log[log.length - 1]).toEqual(['alpha']);
		expect(beta.hasAttribute('data-selected')).toBe(false);
	});

	it('the select-all checkbox in the header selects and clears every row', async () => {
		const log: any[] = [];
		const r = mountTracked(SelectableTableHarness, {
			onSelectionChange: (keys: any) => log.push(keys === 'all' ? 'all' : [...keys].sort()),
		});
		await act(() => {});

		const header = grid(r).querySelector('thead [role="row"]') as HTMLElement;
		const selectAll = header.querySelector('input') as HTMLInputElement;
		expect(selectAll.type).toBe('checkbox');
		expect(selectAll.checked).toBe(false);

		await act(() => {
			selectAll.click();
		});
		await act(() => {});
		expect(log[log.length - 1]).toBe('all');
		expect(selectAll.checked).toBe(true);
		for (const row of bodyRows(r)) {
			expect(row.getAttribute('data-selected')).toBe('true');
		}

		await act(() => {
			selectAll.click();
		});
		await act(() => {});
		expect(log[log.length - 1]).toEqual([]);
		for (const row of bodyRows(r)) {
			expect(row.hasAttribute('data-selected')).toBe(false);
		}
	});

	it('disabledKeys disables rows: aria-disabled, disabled checkbox, press is inert', async () => {
		const log: any[] = [];
		const r = mountTracked(SelectableTableHarness, {
			disabledKeys: ['beta'],
			disabledBehavior: 'all',
			onSelectionChange: (keys: any) => log.push([...keys]),
		});
		await act(() => {});

		const [alpha, beta] = bodyRows(r);
		expect(beta.getAttribute('aria-disabled')).toBe('true');
		expect(beta.getAttribute('data-disabled')).toBe('true');
		// Table rows keep aria-selected while disabled (useGridRow keys it off the
		// table's selectionMode, unlike GridList/Tree rows which omit it).
		expect(beta.getAttribute('aria-selected')).toBe('false');
		expect(alpha.getAttribute('aria-selected')).toBe('false');
		expect(alpha.hasAttribute('aria-disabled')).toBe(false);

		const betaCheckbox = beta.querySelector('input') as HTMLInputElement;
		expect(betaCheckbox.disabled).toBe(true);

		await press(beta);
		await act(() => {});
		expect(log.length).toBe(0);
		expect(beta.hasAttribute('data-selected')).toBe(false);
	});
});

describe('@octanejs/aria/components — ResizableTableContainer + ColumnResizer', () => {
	it('renders the resizer wiring and drives resize mode from the keyboard', async () => {
		const r = mountTracked(ResizableTableHarness, {});
		await act(() => {});

		const container = r.container.firstElementChild as HTMLElement;
		expect(container.className).toBe('react-aria-ResizableTableContainer');
		expect(container.contains(grid(r))).toBe(true);

		const resizer = r.container.querySelector('[data-testid="name-resizer"]') as HTMLElement;
		expect(resizer).toBeTruthy();
		expect(resizer.className).toBe('react-aria-ColumnResizer');
		expect(resizer.getAttribute('role')).toBe('presentation');
		// The direction value is derived from column min/max/current widths, which are
		// layout-driven — only assert it is one of the valid values in jsdom.
		expect(['left', 'right', 'both']).toContain(resizer.getAttribute('data-resizable-direction'));
		expect(resizer.hasAttribute('data-resizing')).toBe(false);

		// The visually hidden input is a range labelled by itself + its column header.
		const input = resizer.querySelector('input') as HTMLInputElement;
		expect(input.type).toBe('range');
		const nameHeader = columnHeaders(r)[0];
		expect(nameHeader.id).toBeTruthy();
		expect(input.getAttribute('aria-labelledby')).toContain(nameHeader.id);
		expect(input.getAttribute('aria-label')).toBe('Resizer');
		expect(input.getAttribute('aria-orientation')).toBe('horizontal');

		// Keyboard entry: Enter on the (focused) input starts resizing; the resizer
		// and its column reflect data-resizing. Escape ends it. (Pixel widths are
		// layout-driven and inert in jsdom — only the mode wiring is asserted.)
		await act(() => {
			input.focus();
			keydown(input, 'Enter');
		});
		await act(() => {});
		expect(resizer.getAttribute('data-resizing')).toBe('true');
		expect(nameHeader.getAttribute('data-resizing')).toBe('true');

		await act(() => {
			keydown(input, 'Escape');
		});
		await act(() => {});
		expect(resizer.hasAttribute('data-resizing')).toBe(false);
		expect(nameHeader.hasAttribute('data-resizing')).toBe(false);
	});
});
