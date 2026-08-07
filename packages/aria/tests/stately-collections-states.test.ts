import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from 'octane/compiler';
import { act, mount } from '../../octane/tests/_helpers';
import {
	ListHarness,
	SingleSelectHarness,
	TreeHarness,
	TabsHarness,
	MenuTriggerHarness,
	SubmenuHarness,
	SelectHarness,
	SelectEmptyHarness,
	ComboBoxHarness,
	NumberFieldHarness,
	ControlledNumberFieldHarness,
	SliderHarness,
} from './_fixtures/stately-collections-states.tsx';

// @octanejs/aria/stately — Phase-2 collection + state hooks.

const text = (r: { container: HTMLElement }, testid: string) =>
	r.container.querySelector(`[data-testid="${testid}"]`)!.textContent;
const click = (r: { container: HTMLElement }, testid: string) =>
	r.container.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`)!.click();

describe('@octanejs/aria/stately — useListState', () => {
	it('builds nodes from dynamic items + render function and tracks multiple selection', async () => {
		const r = mount(ListHarness);
		expect(text(r, 'nodes')).toBe('n:a=Alpha,b=Beta,c=Gamma');
		expect(text(r, 'first')).toBe('f:a');
		expect(text(r, 'selected')).toBe('s:a');

		// Multiple selection with the default toggle behavior adds to the selection.
		await act(() => click(r, 'toggle-b'));
		expect(text(r, 'selected')).toBe('s:a,b');

		// Toggling again removes it.
		await act(() => click(r, 'toggle-b'));
		expect(text(r, 'selected')).toBe('s:a');
		r.unmount();
	});

	it('rebuilds the collection when the items prop changes', async () => {
		const r = mount(ListHarness);
		await act(() => click(r, 'drop-a'));
		expect(text(r, 'nodes')).toBe('n:b=Beta,c=Gamma');
		expect(text(r, 'first')).toBe('f:b');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useSingleSelectListState', () => {
	it('seeds from defaultSelectedKey and resolves the selected item from the collection', async () => {
		const r = mount(SingleSelectHarness);
		expect(text(r, 'selected')).toBe('k:one');
		expect(text(r, 'item')).toBe('i:One');

		await act(() => click(r, 'set-two'));
		expect(text(r, 'selected')).toBe('k:two');
		expect(text(r, 'item')).toBe('i:Two');
		expect(text(r, 'log')).toBe('log:two:1');
		r.unmount();
	});

	it('fires onSelectionChange even when re-selecting the current key via the selection manager', async () => {
		const r = mount(SingleSelectHarness);
		await act(() => click(r, 'set-two'));
		expect(text(r, 'log')).toBe('log:two:1');

		// Selecting the already-selected key through the selection manager still notifies
		// (useControlledState alone would swallow the duplicate).
		await act(() => click(r, 'select-two'));
		expect(text(r, 'selected')).toBe('k:two');
		expect(text(r, 'log')).toBe('log:two:2');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useTreeState', () => {
	it('collapsed items stay out of the collection until their key is expanded', async () => {
		const r = mount(TreeHarness);
		expect(text(r, 'expanded')).toBe('e:empty');
		expect(text(r, 'size')).toBe('size:2'); // root + solo; children hidden
		expect(text(r, 'c1')).toBe('c1:no');

		await act(() => click(r, 'toggle-root'));
		expect(text(r, 'expanded')).toBe('e:root');
		expect(text(r, 'size')).toBe('size:4');
		expect(text(r, 'c1')).toBe('c1:yes');
		expect(text(r, 'log')).toBe('log:root');

		// Toggling the same key collapses it again and notifies with the empty set.
		await act(() => click(r, 'toggle-root'));
		expect(text(r, 'expanded')).toBe('e:empty');
		expect(text(r, 'size')).toBe('size:2');
		expect(text(r, 'log')).toBe('log:empty');
		r.unmount();
	});

	it('setExpandedKeys replaces the expanded set wholesale', async () => {
		const r = mount(TreeHarness);
		await act(() => click(r, 'toggle-root'));
		expect(text(r, 'size')).toBe('size:4');
		await act(() => click(r, 'collapse-all'));
		expect(text(r, 'expanded')).toBe('e:empty');
		expect(text(r, 'size')).toBe('size:2');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useTabListState', () => {
	it('auto-selects the first non-disabled tab and exposes disabledKeys', async () => {
		const r = mount(TabsHarness);
		// The ensure-selected effect skips disabled t1 and lands on t2.
		await act(() => {});
		expect(text(r, 'selected')).toBe('k:t2');
		expect(text(r, 'disabled')).toBe('d:t1');
		expect(text(r, 'isdisabled')).toBe('dis:false');
		r.unmount();
	});

	it('selection moves via setSelectedKey and a disabled tab is never selected', async () => {
		const r = mount(TabsHarness);
		await act(() => {});
		await act(() => click(r, 'set-t3'));
		expect(text(r, 'selected')).toBe('k:t3');

		// Selecting a disabled tab through the selection manager empties the selection
		// (replaceSelection refuses the disabled key), and the tab list's ensure-selected
		// effect falls back to the first enabled tab — the disabled tab is never selected.
		await act(() => click(r, 'select-disabled'));
		expect(text(r, 'selected')).toBe('k:t2');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useMenuTriggerState', () => {
	it('open/toggle set the focus strategy and close clears the submenu stack', async () => {
		const r = mount(MenuTriggerHarness);
		expect(text(r, 'open')).toBe('open:false');
		expect(text(r, 'strategy')).toBe('fs:null');

		await act(() => click(r, 'open-first'));
		expect(text(r, 'open')).toBe('open:true');
		expect(text(r, 'strategy')).toBe('fs:first');
		expect(text(r, 'log')).toBe('log:true');

		// Submenus register onto the expanded-keys stack by level.
		await act(() => click(r, 'open-sub'));
		expect(text(r, 'stack')).toBe('stack:sub1');

		// A level deeper than the stack is ignored.
		await act(() => click(r, 'open-sub-deep'));
		expect(text(r, 'stack')).toBe('stack:sub1');

		// close() closes the whole tree: overlay closed AND stack cleared.
		await act(() => click(r, 'close'));
		expect(text(r, 'open')).toBe('open:false');
		expect(text(r, 'stack')).toBe('stack:empty');
		expect(text(r, 'log')).toBe('log:false');

		await act(() => click(r, 'toggle-last'));
		expect(text(r, 'open')).toBe('open:true');
		expect(text(r, 'strategy')).toBe('fs:last');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useSubmenuTriggerState', () => {
	it('toggle opens/closes the submenu at its level and closeAll collapses the tree', async () => {
		const r = mount(SubmenuHarness);
		expect(text(r, 'sub-state')).toBe('sub:false:0');
		expect(text(r, 'root-open')).toBe('root:true');

		await act(() => click(r, 'sub-toggle'));
		expect(text(r, 'sub-state')).toBe('sub:true:0');
		expect(text(r, 'sub-strategy')).toBe('fs:first');

		await act(() => click(r, 'sub-toggle'));
		expect(text(r, 'sub-state')).toBe('sub:false:0');

		await act(() => click(r, 'sub-toggle'));
		expect(text(r, 'sub-state')).toBe('sub:true:0');

		// closeAll routes to the root menu state: root overlay closes and the stack
		// collapses, which closes this submenu too.
		await act(() => click(r, 'sub-close-all'));
		expect(text(r, 'sub-state')).toBe('sub:false:0');
		expect(text(r, 'root-open')).toBe('root:false');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useSelectState', () => {
	it('selection via the manager fires onSelectionChange and closes the menu', async () => {
		const r = mount(SelectHarness);
		expect(text(r, 'value')).toBe('v:red');
		expect(text(r, 'selected-item')).toBe('i:Red');

		await act(() => click(r, 'open'));
		expect(text(r, 'open-state')).toBe('open:true');

		await act(() => click(r, 'select-green'));
		expect(text(r, 'value')).toBe('v:green');
		expect(text(r, 'selected-item')).toBe('i:Green');
		expect(text(r, 'log')).toBe('log:green');
		// shouldCloseOnSelect defaults to true in single selection mode.
		expect(text(r, 'open-state')).toBe('open:false');

		await act(() => click(r, 'set-blue'));
		expect(text(r, 'value')).toBe('v:blue');
		expect(text(r, 'log')).toBe('log:blue');
		r.unmount();
	});

	it('refuses to open over an empty collection', async () => {
		const r = mount(SelectEmptyHarness);
		await act(() => click(r, 'open'));
		expect(text(r, 'open-state')).toBe('open:false');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useComboBoxState', () => {
	it('typing filters the collection, auto-opens the menu, and commit selects the focused item', async () => {
		const r = mount(ComboBoxHarness);
		await act(() => {});
		expect(text(r, 'open-state')).toBe('open:false');
		expect(text(r, 'items')).toBe('items:apple,apricot,banana');

		await act(() => click(r, 'focus'));
		// menuTrigger defaults to 'input': focusing alone does not open.
		expect(text(r, 'open-state')).toBe('open:false');

		await act(() => click(r, 'type-ap'));
		expect(text(r, 'open-state')).toBe('open:true');
		expect(text(r, 'input')).toBe('in:Ap');
		expect(text(r, 'items')).toBe('items:apple,apricot');

		// Committing with a focused key selects it, syncs the input to the item text,
		// and closes the menu.
		await act(() => click(r, 'commit-focused'));
		expect(text(r, 'selected')).toBe('k:apricot');
		expect(text(r, 'input')).toBe('in:Apricot');
		expect(text(r, 'open-state')).toBe('open:false');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useNumberFieldState', () => {
	it('compiles the published number-field hook with Strong render-purity checks enabled', () => {
		const filename = resolve(__dirname, '../src/stately/numberfield/useNumberFieldState.ts');

		expect(() => compile(readFileSync(filename, 'utf8'), filename, { strong: true })).not.toThrow();
	});

	it('preserves unfinished controlled edits when equivalent formatting options are recreated', async () => {
		const props = {
			value: 1234.5,
			locale: 'en-US',
			formatOptions: { minimumFractionDigits: 2, maximumFractionDigits: 3 },
			draft: '9,876.500',
		};
		const r = mount(ControlledNumberFieldHarness, props);
		expect(text(r, 'input')).toBe('in:1,234.50');

		await act(() => click(r, 'edit'));
		expect(text(r, 'input')).toBe('in:9,876.500');
		expect(text(r, 'number')).toBe('n:9876.5');

		r.update(ControlledNumberFieldHarness, {
			...props,
			formatOptions: { ...props.formatOptions },
		});
		expect(text(r, 'input')).toBe('in:9,876.500');
		expect(text(r, 'number')).toBe('n:9876.5');
		r.unmount();
	});

	it.each([
		[{ roundingIncrement: 5 }, '10', '10'],
		[{ roundingIncrement: 5, minimumFractionDigits: 2 }, '12.25', '12.25'],
		[{ roundingIncrement: 5, maximumFractionDigits: 2 }, '12.25', '12.25'],
		[{ roundingIncrement: 25, minimumFractionDigits: 2 }, '12.25', '12.25'],
		[{ style: 'currency', currency: 'USD', roundingIncrement: 5 }, '$10', '10'],
		[{ style: 'currency', currency: 'JPY', roundingIncrement: 5 }, '¥10', '10'],
		[{ style: 'currency', currency: 'BHD', roundingIncrement: 5 }, 'BHD\u00a010', '10'],
		[{ style: 'currency', currency: 'KWD', roundingIncrement: 5 }, 'KWD\u00a010', '10'],
		[
			{ style: 'currency', currency: 'USD', roundingIncrement: 5, minimumFractionDigits: 2 },
			'$12.25',
			'12.25',
		],
	] as const)(
		'formats controlled values when rounding increments are added without paired fraction options: %j',
		(formatOptions, formattedValue, parsedValue) => {
			const props = { value: 12.27, locale: 'en-US', draft: '9.875' };
			const r = mount(ControlledNumberFieldHarness, props);

			r.update(ControlledNumberFieldHarness, { ...props, formatOptions });

			expect(text(r, 'input')).toBe('in:' + formattedValue);
			expect(text(r, 'number')).toBe('n:' + parsedValue);
			r.unmount();
		},
	);

	it('preserves unfinished drafts when equivalent rounding options are recreated before normalization', async () => {
		const props = {
			value: 15,
			locale: 'en-US',
			formatOptions: {
				roundingIncrement: 5,
				minimumFractionDigits: 0,
				maximumFractionDigits: 0,
			},
			draft: '17',
		};
		const r = mount(ControlledNumberFieldHarness, props);

		await act(() => click(r, 'edit'));
		expect(text(r, 'input')).toBe('in:17');

		r.update(ControlledNumberFieldHarness, {
			...props,
			formatOptions: { roundingIncrement: 5, maximumFractionDigits: 0 },
		});

		expect(text(r, 'input')).toBe('in:17');
		expect(text(r, 'number')).toBe('n:17');
		r.unmount();
	});

	it('reconciles a changed controlled number with the displayed and parsed values', async () => {
		const props = { value: 1234.5, locale: 'en-US', draft: '9,876.5' };
		const r = mount(ControlledNumberFieldHarness, props);

		await act(() => click(r, 'edit'));
		expect(text(r, 'input')).toBe('in:9,876.5');

		r.update(ControlledNumberFieldHarness, { ...props, value: 2500.25 });
		expect(text(r, 'input')).toBe('in:2,500.25');
		expect(text(r, 'number')).toBe('n:2500.25');
		r.unmount();
	});

	it('reformats and reparses controlled values when locale or formatting options change', async () => {
		const props = { value: 1234.5, locale: 'en-US', draft: '9,876.5' };
		const r = mount(ControlledNumberFieldHarness, props);

		await act(() => click(r, 'edit'));
		r.update(ControlledNumberFieldHarness, {
			...props,
			locale: 'de-DE',
			draft: '9.876,5',
		});
		expect(text(r, 'input')).toBe('in:1.234,5');
		expect(text(r, 'number')).toBe('n:1234.5');
		expect(text(r, 'valid')).toBe('valid:true');

		r.update(ControlledNumberFieldHarness, {
			...props,
			locale: 'de-DE',
			draft: '9.876,5',
			formatOptions: { minimumFractionDigits: 2 },
		});
		expect(text(r, 'input')).toBe('in:1.234,50');
		expect(text(r, 'number')).toBe('n:1234.5');
		r.unmount();
	});

	it('retains the numbering system selected by user-entered digits on a controlled update', async () => {
		const props = { value: 1234.5, locale: 'ar-EG', draft: '9876.5' };
		const r = mount(ControlledNumberFieldHarness, props);

		await act(() => click(r, 'edit'));
		expect(text(r, 'input')).toBe('in:9876.5');
		expect(text(r, 'number')).toBe('n:9876.5');

		r.update(ControlledNumberFieldHarness, { ...props, value: 2500.25 });
		expect(text(r, 'input')).toBe('in:2,500.25');
		expect(text(r, 'number')).toBe('n:2500.25');
		r.unmount();
	});

	it('commits locale-formatted edits without replacing an unchanged controlled value', async () => {
		const changes: number[] = [];
		const r = mount(ControlledNumberFieldHarness, {
			value: 1234.5,
			locale: 'de-DE',
			draft: '4.321,25',
			onChange: (value: number) => changes.push(value),
		});

		await act(() => click(r, 'edit'));
		expect(text(r, 'number')).toBe('n:4321.25');
		await act(() => click(r, 'commit'));

		expect(changes).toEqual([4321.25]);
		expect(text(r, 'input')).toBe('in:1.234,5');
		expect(text(r, 'number')).toBe('n:1234.5');
		r.unmount();
	});

	it('increments, decrements, and clamps to min/max', async () => {
		const r = mount(NumberFieldHarness);
		expect(text(r, 'input')).toBe('in:5');
		expect(text(r, 'number')).toBe('n:5');
		expect(text(r, 'can')).toBe('can:true,true');

		await act(() => click(r, 'inc'));
		expect(text(r, 'number')).toBe('n:6');
		expect(text(r, 'input')).toBe('in:6');
		expect(text(r, 'log')).toBe('log:6');

		await act(() => click(r, 'inc-max'));
		expect(text(r, 'number')).toBe('n:10');
		expect(text(r, 'can')).toBe('can:false,true');

		// Incrementing at the max is a no-op.
		await act(() => click(r, 'inc'));
		expect(text(r, 'number')).toBe('n:10');

		await act(() => click(r, 'dec-min'));
		expect(text(r, 'number')).toBe('n:0');
		expect(text(r, 'can')).toBe('can:true,false');
		expect(text(r, 'log')).toBe('log:0');
		r.unmount();
	});

	it('commit parses and clamps typed input to the max', async () => {
		const r = mount(NumberFieldHarness);
		await act(() => click(r, 'type-40'));
		expect(text(r, 'number')).toBe('n:40'); // parsed value tracks the raw input
		await act(() => click(r, 'commit'));
		expect(text(r, 'number')).toBe('n:10'); // snapped into [0, 10]
		expect(text(r, 'input')).toBe('in:10');
		r.unmount();
	});

	it('surfaces validate() errors on commitValidation and partial input validity', async () => {
		const r = mount(NumberFieldHarness);
		expect(text(r, 'invalid')).toBe('inv:false:');
		// Partial input validation: digits ok, letters not, minus sign rejected with min >= 0.
		expect(text(r, 'partial')).toBe('p:true,false,false');

		// 5 → +1 → ... 9 exceeds the validate() threshold (v > 8); stepper commits validation.
		await act(() => click(r, 'inc-max'));
		expect(text(r, 'invalid')).toBe('inv:true:Too big');
		await act(() => click(r, 'dec-min'));
		expect(text(r, 'invalid')).toBe('inv:false:');
		r.unmount();
	});
});

describe('@octanejs/aria/stately — useSliderState', () => {
	it('percent updates snap to the step and report thumb percent/label', async () => {
		const r = mount(SliderHarness);
		expect(text(r, 'values')).toBe('v:20');
		expect(text(r, 'percent')).toBe('p:0.2');
		expect(text(r, 'label')).toBe('l:20');

		// 37% of [0,100] = 37, rounded to the step (10) = 40.
		await act(() => click(r, 'set-37'));
		expect(text(r, 'values')).toBe('v:40');
		expect(text(r, 'percent')).toBe('p:0.4');
		expect(text(r, 'log')).toBe('log:40');

		// setThumbValue snaps 33 down to 30.
		await act(() => click(r, 'set-33'));
		expect(text(r, 'values')).toBe('v:30');
		expect(text(r, 'label')).toBe('l:30');
		r.unmount();
	});

	it('increment/decrement move by at least the step', async () => {
		const r = mount(SliderHarness);
		await act(() => click(r, 'inc'));
		expect(text(r, 'values')).toBe('v:30');
		await act(() => click(r, 'dec'));
		expect(text(r, 'values')).toBe('v:20');
		r.unmount();
	});

	it('drag lifecycle tracks isThumbDragging and fires onChangeEnd once released', async () => {
		const r = mount(SliderHarness);
		await act(() => click(r, 'drag-start'));
		expect(text(r, 'dragging')).toBe('drag:true');
		expect(text(r, 'end')).toBe('end:none');

		await act(() => click(r, 'set-37'));
		await act(() => click(r, 'drag-end'));
		expect(text(r, 'dragging')).toBe('drag:false');
		// onChangeEnd reports the final (snapped) value for the single thumb.
		expect(text(r, 'end')).toBe('end:40');
		r.unmount();
	});
});
