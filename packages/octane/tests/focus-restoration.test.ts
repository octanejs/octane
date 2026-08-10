import { describe, expect, it, vi } from 'vitest';
import { createElement, createRoot, flushSync, useLayoutEffect } from '../src/index.js';
import { mount } from './_helpers';
import { FastHostControlledList } from './_fixtures/for.tsrx';

const rows = [
	{ id: 1, label: 'first value' },
	{ id: 2, label: 'selected value' },
	{ id: 3, label: 'third value' },
	{ id: 4, label: 'fourth value' },
];

type FocusRow = (typeof rows)[number];

interface ObservedRowsProps {
	items: FocusRow[];
	observe?: (focused: Element | null) => void;
	moveFocus?: boolean;
	addAutoFocus?: boolean;
}

const layoutSlot = Symbol('focus-restoration layout');

function ObservedRows(props: ObservedRowsProps) {
	useLayoutEffect(
		() => {
			props.observe?.(document.activeElement);
			if (props.moveFocus) document.getElementById('focus-override')?.focus();
		},
		[props.items, props.observe, props.moveFocus, props.addAutoFocus],
		layoutSlot,
	);
	return createElement('section', {
		children: [
			createElement(FastHostControlledList, { key: 'rows', items: props.items }),
			createElement('button', { key: 'override', id: 'focus-override', children: 'override' }),
			props.addAutoFocus
				? createElement('input', { key: 'autofocus', id: 'focus-new', autoFocus: true })
				: null,
		],
	});
}

function EditableRows(props: { items: FocusRow[] }) {
	return createElement('section', {
		children: props.items.map((row) =>
			createElement('div', {
				key: row.id,
				id: `focus-editable-${row.id}`,
				contentEditable: true,
				suppressContentEditableWarning: true,
				children: [
					createElement('span', { key: 'first', children: 'first words' }),
					createElement('span', { key: 'second', children: ' second words' }),
				],
			}),
		),
	});
}

describe('focus and text selection survive DOM updates', () => {
	// Per ReactDOM-test.js, "preserves focus": DOM mutations may blur a
	// surviving control, but focus must be restored before the commit ends.
	it('keeps the focused keyed input and its selected text when its row moves', () => {
		const rendered = mount(FastHostControlledList, { items: rows });
		try {
			const input = rendered.findAll('input')[1] as HTMLInputElement;
			input.focus();
			input.setSelectionRange(2, 9, 'backward');

			rendered.update(FastHostControlledList, { items: rows.toReversed() });

			expect(rendered.findAll('input')[2]).toBe(input);
			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([2, 9]);
		} finally {
			rendered.unmount();
		}
	});

	it('restores focus when an update is committed by its normal scheduled flush', async () => {
		const rendered = mount(FastHostControlledList, { items: rows });
		try {
			const input = rendered.findAll('input')[1] as HTMLInputElement;
			input.focus();
			input.setSelectionRange(2, 9);

			rendered.root.render(FastHostControlledList, { items: rows.toReversed() });
			await Promise.resolve();

			expect(rendered.findAll('input')[2]).toBe(input);
			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([2, 9]);
		} finally {
			rendered.unmount();
		}
	});

	it('restores selected text if moving the control resets its selection', () => {
		const rendered = mount(FastHostControlledList, { items: rows });
		const parent = rendered.find('#fast-host-controlled-list');
		const originalInsert = parent.insertBefore;
		const input = rendered.findAll('input')[1] as HTMLInputElement;
		input.focus();
		input.setSelectionRange(2, 9);
		const move = vi.spyOn(parent, 'insertBefore').mockImplementation(function <T extends Node>(
			node: T,
			anchor: Node | null,
		): T {
			const result = originalInsert.call(this, node, anchor) as T;
			if (document.activeElement !== input) input.setSelectionRange(0, 0);
			return result;
		});
		try {
			rendered.update(FastHostControlledList, { items: rows.toReversed() });

			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([2, 9]);
		} finally {
			move.mockRestore();
			rendered.unmount();
		}
	});

	it('restores focus before layout effects observe the updated DOM', () => {
		const observed: Array<Element | null> = [];
		const observe = (focused: Element | null) => observed.push(focused);
		const rendered = mount(ObservedRows, { items: rows, observe });
		try {
			const input = rendered.findAll('input')[1] as HTMLInputElement;
			input.focus();
			observed.length = 0;

			rendered.update(ObservedRows, { items: rows.toReversed(), observe });

			expect(observed).toEqual([input]);
			expect(document.activeElement).toBe(input);
		} finally {
			rendered.unmount();
		}
	});

	it('lets a layout effect deliberately move focus after restoration', () => {
		const observed: Array<Element | null> = [];
		const observe = (focused: Element | null) => observed.push(focused);
		const rendered = mount(ObservedRows, { items: rows, observe });
		try {
			const input = rendered.findAll('input')[1] as HTMLInputElement;
			input.focus();
			observed.length = 0;

			rendered.update(ObservedRows, { items: rows.toReversed(), observe, moveFocus: true });

			expect(observed).toEqual([input]);
			expect(document.activeElement).toBe(rendered.find('#focus-override'));
		} finally {
			rendered.unmount();
		}
	});

	it('restores the previous control before a newly mounted autoFocus control wins', () => {
		const events: string[] = [];
		const observe = (focused: Element | null) => events.push(`layout:${focused?.id}`);
		const rendered = mount(ObservedRows, { items: rows, observe });
		try {
			const previous = rendered.findAll('input')[1] as HTMLInputElement;
			previous.focus();
			events.length = 0;
			rendered.container.addEventListener('focusin', (event) => {
				const focused = event.target as HTMLInputElement;
				events.push(focused.id || focused.value);
			});

			rendered.update(ObservedRows, {
				items: rows.toReversed(),
				observe,
				addAutoFocus: true,
			});

			expect(events).toEqual(['selected value', 'focus-new', 'layout:focus-new']);
			expect(document.activeElement).toBe(rendered.find('#focus-new'));
		} finally {
			rendered.unmount();
		}
	});

	it('does not refocus a control removed by the update', () => {
		const rendered = mount(FastHostControlledList, { items: rows });
		const input = rendered.findAll('input')[1] as HTMLInputElement;
		input.focus();
		const focus = vi.spyOn(input, 'focus');
		try {
			rendered.update(FastHostControlledList, {
				items: rows.filter((row) => row.id !== 2),
			});

			expect(input.isConnected).toBe(false);
			expect(focus).not.toHaveBeenCalled();
			expect(document.activeElement).not.toBe(input);
		} finally {
			focus.mockRestore();
			rendered.unmount();
		}
	});

	it('restores a still-connected focused control outside the updating root', () => {
		const outside = document.createElement('button');
		document.body.appendChild(outside);
		const rendered = mount(FastHostControlledList, { items: rows });
		const parent = rendered.find('#fast-host-controlled-list');
		const originalInsert = parent.insertBefore;
		outside.focus();
		const move = vi.spyOn(parent, 'insertBefore').mockImplementation(function <T extends Node>(
			node: T,
			anchor: Node | null,
		): T {
			const result = originalInsert.call(this, node, anchor) as T;
			outside.blur();
			return result;
		});
		try {
			rendered.update(FastHostControlledList, { items: rows.toReversed() });

			expect(
				rendered.findAll('input').map((element) => (element as HTMLInputElement).value),
			).toEqual(rows.toReversed().map((row) => row.label));
			expect(document.activeElement).toBe(outside);
		} finally {
			move.mockRestore();
			rendered.unmount();
			outside.remove();
		}
	});

	it('restores focus to a moved content-editable host with an active selection', () => {
		const rendered = mount(EditableRows, { items: rows });
		try {
			const editable = rendered.find('#focus-editable-2') as HTMLElement;
			const first = editable.querySelectorAll('span')[0]!.firstChild!;
			const second = editable.querySelectorAll('span')[1]!.firstChild!;
			editable.focus();
			const range = document.createRange();
			range.setStart(second, 4);
			range.collapse(true);
			const selection = document.getSelection()!;
			selection.removeAllRanges();
			selection.addRange(range);
			selection.extend(first, 2);
			expect(selection.toString()).toBe('rst words sec');

			rendered.update(EditableRows, { items: rows.toReversed() });

			expect(rendered.find('#focus-editable-2')).toBe(editable);
			expect(document.activeElement).toBe(editable);
		} finally {
			document.getSelection()?.removeAllRanges();
			rendered.unmount();
		}
	});

	// Per ReactDOMFiber-test.js, "should restore selection in the correct
	// window": the owning document, not the ambient document, owns focus.
	it('restores focus and selection in the root container’s owner document', () => {
		const frame = document.createElement('iframe');
		document.body.appendChild(frame);
		const frameDocument = frame.contentDocument!;
		const container = frameDocument.createElement('div');
		frameDocument.body.appendChild(container);
		const root = createRoot(container);
		try {
			root.render(FastHostControlledList, { items: rows });
			flushSync(() => {});
			const input = container.querySelectorAll('input')[1]!;
			input.focus();
			input.setSelectionRange(2, 9);

			flushSync(() => root.render(FastHostControlledList, { items: rows.toReversed() }));

			expect(container.querySelectorAll('input')[2]).toBe(input);
			expect(frameDocument.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([2, 9]);
		} finally {
			root.unmount();
			frame.remove();
		}
	});
});
