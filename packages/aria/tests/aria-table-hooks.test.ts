import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	TableHarness,
	VirtualizedTableHarness,
	DelegateHarness,
	ResizerHarness,
} from './_fixtures/aria-table-hooks.tsx';

// jsdom lacks CSS.escape (used by the selection delegates' data-key selectors).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// Behavioral coverage for the aria table hook family: the grid/row/cell roles and ids a
// consumer observes, sort transitions through the column headers, selection through rows
// and native-change checkboxes, the public TableKeyboardDelegate navigation contract, and
// the column-resizer wiring (pixel math is layout-driven and inert in jsdom).

function pointerEvent(type: string, init: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		composed: true,
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

type Mounted = ReturnType<typeof mount>;

function grid(r: Mounted): HTMLElement {
	return r.container.querySelector('[role="grid"]') as HTMLElement;
}

describe('@octanejs/aria — useTable structure', () => {
	it('wires role=grid with rowgroups, a header row of columnheaders, and rowheader/gridcell body cells', async () => {
		const r = mount(TableHarness, {});
		await act(() => {});
		const table = grid(r);
		expect(table).toBeTruthy();
		expect(table.getAttribute('aria-label')).toBe('Files');
		expect(table.getAttribute('aria-multiselectable')).toBe('true');
		// Non-virtualized tables carry no aria-rowcount/colcount.
		expect(table.getAttribute('aria-rowcount')).toBe(null);
		expect(table.getAttribute('aria-colcount')).toBe(null);
		expect(r.container.querySelectorAll('[role="rowgroup"]').length).toBe(2);
		// 1 header row + 2 body rows.
		expect(r.container.querySelectorAll('[role="row"]').length).toBe(3);
		// Selection column + 3 user columns.
		expect(r.container.querySelectorAll('[role="columnheader"]').length).toBe(4);
		// The isRowHeader (name) cell of each body row is a rowheader; the rest are gridcells.
		expect(r.container.querySelectorAll('[role="rowheader"]').length).toBe(2);
		expect(r.container.querySelectorAll('[role="gridcell"]').length).toBe(6);
		// Each row is labelled by its rowheader cell.
		const row1 = r.container.querySelector('[data-testid="row-r1"]') as HTMLElement;
		const rowHeader1 = row1.querySelector('[role="rowheader"]') as HTMLElement;
		expect(rowHeader1.id).toBeTruthy();
		expect(row1.getAttribute('aria-labelledby')).toBe(rowHeader1.id);
		expect(rowHeader1.textContent!.trim()).toBe('Games');
		r.unmount();
	});

	it('annotates virtualized tables with aria-rowcount/colcount and 1-based row/col indices', async () => {
		const r = mount(VirtualizedTableHarness, {});
		await act(() => {});
		const table = grid(r);
		// 2 body rows + 1 header row; 3 user columns + the selection column.
		expect(table.getAttribute('aria-rowcount')).toBe('3');
		expect(table.getAttribute('aria-colcount')).toBe('4');
		const rows = [...r.container.querySelectorAll('[role="row"]')] as HTMLElement[];
		expect(rows[0].getAttribute('aria-rowindex')).toBe('1');
		const row1 = r.container.querySelector('[data-testid="row-r1"]') as HTMLElement;
		const row2 = r.container.querySelector('[data-testid="row-r2"]') as HTMLElement;
		expect(row1.getAttribute('aria-rowindex')).toBe('2');
		expect(row2.getAttribute('aria-rowindex')).toBe('3');
		const cellIndices = [...row1.querySelectorAll('[role="gridcell"], [role="rowheader"]')].map(
			(c) => c.getAttribute('aria-colindex'),
		);
		expect(cellIndices).toEqual(['1', '2', '3', '4']);
		r.unmount();
	});
});

describe('@octanejs/aria — useTableColumnHeader sorting', () => {
	it('transitions aria-sort none → ascending → descending as a sortable header is pressed', async () => {
		const r = mount(TableHarness, {});
		await act(() => {});
		const nameHeader = r.container.querySelector('[data-testid="col-name"]') as HTMLElement;
		const typeHeader = r.container.querySelector('[data-testid="col-type"]') as HTMLElement;
		expect(nameHeader.getAttribute('aria-sort')).toBe('none');
		expect(typeHeader.getAttribute('aria-sort')).toBe('none');
		// Sortable headers get the intl "sortable column" description.
		const describedBy = nameHeader.getAttribute('aria-describedby');
		expect(describedBy).toBeTruthy();
		expect(document.getElementById(describedBy!)!.textContent).toBe('sortable column');

		await press(nameHeader);
		expect(nameHeader.getAttribute('aria-sort')).toBe('ascending');
		expect(typeHeader.getAttribute('aria-sort')).toBe('none');

		await press(nameHeader);
		expect(nameHeader.getAttribute('aria-sort')).toBe('descending');

		// The grid itself is described by the current sort order.
		const table = grid(r);
		const gridDescribedBy = table.getAttribute('aria-describedby');
		expect(gridDescribedBy).toBeTruthy();
		const descriptions = gridDescribedBy!
			.split(' ')
			.map((id) => document.getElementById(id)?.textContent ?? '')
			.join(' ');
		expect(descriptions).toContain('sorted by column Name in descending order');
		r.unmount();
	});
});

describe('@octanejs/aria — useTableRow selection', () => {
	it('reflects selection in aria-selected when a row cell is pressed', async () => {
		const r = mount(TableHarness, {});
		await act(() => {});
		const row1 = r.container.querySelector('[data-testid="row-r1"]') as HTMLElement;
		expect(row1.getAttribute('aria-selected')).toBe('false');
		// Pressing a data cell selects its row (cell selection is not enabled, so the
		// selection manager resolves the press to the parent row).
		const cell = row1.querySelectorAll('[role="gridcell"]')[1] as HTMLElement;
		await press(cell);
		expect(row1.getAttribute('aria-selected')).toBe('true');
		r.unmount();
	});
});

describe('@octanejs/aria — useTableSelectionCheckbox / useTableSelectAllCheckbox', () => {
	it('labels the checkboxes from intl and toggles row selection through native change', async () => {
		const r = mount(TableHarness, {});
		await act(() => {});
		const row2 = r.container.querySelector('[data-testid="row-r2"]') as HTMLElement;
		const checkbox = r.container.querySelector('[data-testid="checkbox-r2"]') as HTMLInputElement;
		const selectAll = r.container.querySelector('[data-testid="select-all"]') as HTMLInputElement;
		// Row checkbox: intl "Select" label, labelled by itself + the row's rowheader cell.
		expect(checkbox.getAttribute('aria-label')).toBe('Select');
		const labelledBy = checkbox.getAttribute('aria-labelledby')!;
		expect(labelledBy.split(' ')).toContain(checkbox.id);
		const rowHeader2 = row2.querySelector('[role="rowheader"]') as HTMLElement;
		expect(labelledBy.split(' ')).toContain(rowHeader2.id);
		// Select-all checkbox: intl "Select All" label.
		expect(selectAll.getAttribute('aria-label')).toBe('Select All');
		expect(selectAll.disabled).toBe(false);

		// Native change on the row checkbox toggles the row's selection.
		expect(row2.getAttribute('aria-selected')).toBe('false');
		await act(() => {
			checkbox.checked = true;
			checkbox.dispatchEvent(new Event('change', { bubbles: true }));
		});
		expect(row2.getAttribute('aria-selected')).toBe('true');
		expect(checkbox.checked).toBe(true);
		await act(() => {
			checkbox.checked = false;
			checkbox.dispatchEvent(new Event('change', { bubbles: true }));
		});
		expect(row2.getAttribute('aria-selected')).toBe('false');

		// Native change on the select-all checkbox selects every row.
		await act(() => {
			selectAll.checked = true;
			selectAll.dispatchEvent(new Event('change', { bubbles: true }));
		});
		const row1 = r.container.querySelector('[data-testid="row-r1"]') as HTMLElement;
		expect(row1.getAttribute('aria-selected')).toBe('true');
		expect(row2.getAttribute('aria-selected')).toBe('true');
		expect(selectAll.checked).toBe(true);
		r.unmount();
	});
});

describe('@octanejs/aria — TableKeyboardDelegate', () => {
	it('navigates between column headers, rows, and cells (with wrap-around and typeahead)', async () => {
		const r = mount(DelegateHarness, {});
		await act(() => {});
		const text = (id: string) =>
			(r.container.querySelector(`[data-testid="${id}"]`) as HTMLElement).textContent;
		// Column → cell below (same index), row → next row, cell → cell below in same column.
		expect(text('below')).toBe('below:true:true:true');
		// Row above, first row → first column header, cell → its column header.
		expect(text('above')).toBe('above:true:true:true');
		// Column → next column (wrapping past the last), row → first cell, cell → next cell.
		expect(text('rightof')).toBe('rightof:true:true:true:true');
		// Column → previous column (wrapping before the first), first cell → parent row.
		expect(text('leftof')).toBe('leftof:true:true:true');
		expect(text('firstlast')).toBe('fl:true:true');
		// Typeahead matches row-header cell text and resolves to the row.
		expect(text('search')).toBe('search:r2');
		r.unmount();
	});
});

describe('@octanejs/aria — useTableColumnResize', () => {
	it('wires the visually hidden range input to the resize state and fires the resize lifecycle', async () => {
		const r = mount(ResizerHarness, {});
		await act(() => {});
		const input = r.container.querySelector('[data-testid="resizer-input"]') as HTMLInputElement;
		const resizer = r.container.querySelector('[data-testid="resizer"]') as HTMLElement;
		const header = r.container.querySelector('[data-testid="col-name"]') as HTMLElement;
		const text = (id: string) =>
			(r.container.querySelector(`[data-testid="${id}"]`) as HTMLElement).textContent;

		// Input wiring: a horizontal range slider labelled by its own id + the column header id.
		expect(input.type).toBe('range');
		expect(input.getAttribute('aria-orientation')).toBe('horizontal');
		expect(input.getAttribute('aria-label')).toBe('Resizer');
		expect(input.getAttribute('aria-labelledby')).toBe(`${input.id} ${header.id}`);
		// 600px table / 3 equal columns → the state reports 200 for this column.
		expect(input.value).toBe('200');
		expect(input.getAttribute('aria-valuetext')).toBe('200 pixels');
		expect(input.getAttribute('min')).toBe('75');
		expect(resizer.getAttribute('data-resizing')).toBe('false');

		// Entering resize mode through the state flows back into the hook: it reports
		// isResizing and fires onResizeStart with the committed widths.
		const startButton = r.container.querySelector('[data-testid="start-resize"]') as HTMLElement;
		await act(() => startButton.click());
		expect(text('resizing-col')).toBe('rc:name');
		expect(resizer.getAttribute('data-resizing')).toBe('true');
		expect(text('resize-log')).toContain('start:');
		expect(text('resize-log')).toContain('name=200');

		// A native change on the range input steps the column width (+10 when increasing).
		await act(() => {
			input.value = '250';
			input.dispatchEvent(new Event('change', { bubbles: true }));
		});
		expect(text('resize-log')).toContain('resize:');
		expect(text('resize-log')).toContain('name=210');
		expect(input.value).toBe('210');

		// Escape on the resizer (edit mode) ends the resize and fires onResizeEnd.
		await act(() => {
			resizer.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
		});
		expect(text('resize-log')).toContain('end:');
		expect(text('resizing-col')).toBe('rc:null');
		expect(resizer.getAttribute('data-resizing')).toBe('false');
		r.unmount();
	});
});
