import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	TableHarness,
	NestedHeaderHarness,
	CheckboxTableHarness,
	ResizeHarness,
	TreeGridHarness,
	TreeGridAllHarness,
	GridHarness,
} from './_fixtures/stately-table.tsx';

// @octanejs/aria/stately — grid + table state hooks (Tree/Table phase, W1a).

const text = (r: { container: HTMLElement }, testid: string) =>
	r.container.querySelector(`[data-testid="${testid}"]`)!.textContent;
const click = (r: { container: HTMLElement }, testid: string) =>
	r.container.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!.click();

describe('@octanejs/aria/stately — useTableState', () => {
	it('builds header and body structure from dynamic columns and rows', () => {
		const r = mount(TableHarness);
		expect(text(r, 'cols')).toBe('cols:name=Name,type=Type,date=Date');
		expect(text(r, 'hrows')).toBe('hrows:headerrow-0[name|type|date]');
		expect(text(r, 'rows')).toBe(
			'rows:r1[Games|File folder|6/7/2020],r2[Program Files|File folder|4/7/2021],r3[bootmgr|System file|11/20/2010]',
		);
		expect(text(r, 'rowheaders')).toBe('rh:name');
		// getTextValue combines the row header column cells.
		expect(text(r, 'textvalue')).toBe('tv:Games');
		r.unmount();
	});

	it('tracks multiple row selection through the selectionManager and skips disabled rows', async () => {
		const r = mount(TableHarness);
		expect(text(r, 'selected')).toBe('s:empty');
		expect(text(r, 'disabled')).toBe('d:r3');

		await act(() => click(r, 'select-r1'));
		expect(text(r, 'selected')).toBe('s:r1');
		await act(() => click(r, 'select-r2'));
		expect(text(r, 'selected')).toBe('s:r1,r2');

		// r3 is disabled (disabledBehavior defaults to 'selection' in useTableState).
		await act(() => click(r, 'select-r3'));
		expect(text(r, 'selected')).toBe('s:r1,r2');

		// Toggle behavior removes an already-selected key.
		await act(() => click(r, 'select-r2'));
		expect(text(r, 'selected')).toBe('s:r1');
		r.unmount();
	});

	it('single selection mode replaces the selection on select', async () => {
		const r = mount(TableHarness);
		await act(() => click(r, 'mode-single'));
		await act(() => click(r, 'select-r1'));
		expect(text(r, 'selected')).toBe('s:r1');
		await act(() => click(r, 'select-r2'));
		expect(text(r, 'selected')).toBe('s:r2');
		r.unmount();
	});

	it('sort() calls onSortChange with ascending first, then flips the direction', async () => {
		const r = mount(TableHarness);
		expect(text(r, 'sort')).toBe('sort:none');

		await act(() => click(r, 'sort-name'));
		expect(text(r, 'sort')).toBe('sort:name:ascending');

		// Sorting the same column flips the direction.
		await act(() => click(r, 'sort-name'));
		expect(text(r, 'sort')).toBe('sort:name:descending');

		// Sorting another column starts at ascending again.
		await act(() => click(r, 'sort-type'));
		expect(text(r, 'sort')).toBe('sort:type:ascending');
		r.unmount();
	});

	it('builds tiered header rows with colSpans and placeholders for nested columns', () => {
		const r = mount(NestedHeaderHarness);
		expect(text(r, 'cols')).toBe('cols:name,type,date');
		// Row 0: the "Info" group spans its two leaf columns, then a placeholder pads
		// the row out to the full column count. Row 1: the leaf columns.
		expect(text(r, 'hrows')).toBe('hr:info:2,ph:1;name:1,type:1,date:1');
		expect(text(r, 'cells')).toBe('cells:Games|File folder|6/7/2020');
		r.unmount();
	});

	it('showSelectionCheckboxes prepends a selection column and per-row selection cells', () => {
		const r = mount(CheckboxTableHarness);
		expect(text(r, 'colcount')).toBe('cc:4');
		expect(text(r, 'checkboxcol')).toBe('cb:true:4');
		expect(text(r, 'showcb')).toBe('show:true');
		expect(text(r, 'rowcells')).toBe('rc:selcell|Games|File folder|6/7/2020');
		// The synthetic selection column never becomes a row header.
		expect(text(r, 'rowheaders')).toBe('rh:name');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useTableColumnResizeState', () => {
	it('computes initial column widths from static, default, and fr widths', () => {
		const r = mount(ResizeHarness);
		// tableWidth 500: name defaultWidth 100 + size width 120 are static; the
		// remaining 280 goes to the single 1fr column.
		expect(text(r, 'widths')).toBe('w:name:100,size:120,type:280');
		expect(text(r, 'getwidth')).toBe('gw:100:120:280');
		// Default min width is 75; no maxWidth means MAX_SAFE_INTEGER.
		expect(text(r, 'minmax')).toBe('mm:75:true');
		expect(text(r, 'resizing')).toBe('rz:null');
		r.unmount();
	});

	it('updateResizedColumns freezes the resized column and reflows fr columns', async () => {
		const r = mount(ResizeHarness);
		await act(() => click(r, 'resize-name-150'));
		// The returned map holds the resized column as a pixel value; columns to the
		// right keep their controlled width / fr unit.
		expect(text(r, 'returned')).toBe('ret:name:150,size:120,type:1fr');
		expect(text(r, 'getwidth')).toBe('gw:150:120:230');
		expect(text(r, 'widths')).toBe('w:name:150,size:120,type:230');
		r.unmount();
	});

	it('clamps a resize below the column min width', async () => {
		const r = mount(ResizeHarness);
		await act(() => click(r, 'resize-name-10'));
		expect(text(r, 'getwidth')).toBe('gw:75:120:305');
		r.unmount();
	});

	it('tracks the currently resizing column across start/end', async () => {
		const r = mount(ResizeHarness);
		await act(() => click(r, 'start'));
		expect(text(r, 'resizing')).toBe('rz:name');
		await act(() => click(r, 'end'));
		expect(text(r, 'resizing')).toBe('rz:null');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — UNSTABLE_useTreeGridState', () => {
	it('collapsed child rows stay out of the collection until their parent is expanded', async () => {
		const r = mount(TreeGridHarness);
		expect(text(r, 'expanded')).toBe('e:empty');
		expect(text(r, 'size')).toBe('size:2');
		expect(text(r, 'rows')).toBe('rows:r1,r2');
		expect(text(r, 'child')).toBe('child:no');
		expect(text(r, 'ucc')).toBe('ucc:2');
		// treeColumn defaults to the first row header column key.
		expect(text(r, 'treecol')).toBe('tc:name');

		await act(() => click(r, 'toggle-r1'));
		expect(text(r, 'expanded')).toBe('e:r1');
		expect(text(r, 'size')).toBe('size:3');
		expect(text(r, 'rows')).toBe('rows:r1,r1c1,r2');
		// The keyMap now contains the expanded child row node.
		expect(text(r, 'child')).toBe('child:yes');
		expect(text(r, 'log')).toBe('log:r1');

		await act(() => click(r, 'toggle-r1'));
		expect(text(r, 'expanded')).toBe('e:empty');
		expect(text(r, 'size')).toBe('size:2');
		expect(text(r, 'log')).toBe('log:empty');
		r.unmount();
	});

	it("expandedKeys 'all' expands every row and toggling materializes the remaining set", async () => {
		const r = mount(TreeGridAllHarness);
		expect(text(r, 'expanded')).toBe('e:all');
		expect(text(r, 'size')).toBe('size:3');

		// Toggling from 'all' materializes the expandable-row set minus the key.
		await act(() => click(r, 'toggle-r1'));
		expect(text(r, 'expanded')).toBe('e:empty');
		expect(text(r, 'size')).toBe('size:2');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useGridState', () => {
	it('exposes the grid collection with linked row keys and disabled keys', () => {
		const r = mount(GridHarness);
		expect(text(r, 'keys')).toBe('k:g1:g2:g2:g3');
		expect(text(r, 'colcount')).toBe('cc:2');
		expect(text(r, 'disabled')).toBe('d:g2');
		expect(text(r, 'kbdnav')).toBe('kbd:false');
		r.unmount();
	});

	it('selects rows through the selectionManager and ignores disabled rows', async () => {
		const r = mount(GridHarness);
		expect(text(r, 'selected')).toBe('s:empty');
		await act(() => click(r, 'select-g1'));
		expect(text(r, 'selected')).toBe('s:g1');
		// g2 is disabled (disabledBehavior defaults to 'all').
		await act(() => click(r, 'select-g2'));
		expect(text(r, 'selected')).toBe('s:g1');
		r.unmount();
	});

	it("focusMode 'cell' redirects row focus to the first or last child cell", async () => {
		const r = mount(GridHarness);
		expect(text(r, 'focused')).toBe('f:null');
		await act(() => click(r, 'focus-g1'));
		expect(text(r, 'focused')).toBe('f:g1c1');
		await act(() => click(r, 'focus-g1-last'));
		expect(text(r, 'focused')).toBe('f:g1c2');
		r.unmount();
	});
});
