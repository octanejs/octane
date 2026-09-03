import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { fireEvent as domFireEvent } from '@testing-library/dom';
import { FocusEvents } from './_fixtures/focus-events.tsrx';

afterEach(cleanup);

describe('delegated native focus helpers', () => {
	it.each(['focus', 'blur'] as const)(
		'fireEvent.%s delivers native before delegated focus events and retains cancellation',
		(name) => {
			const relatedTarget = document.createElement('button');
			const records: Array<[string, string, EventTarget | null, EventTarget | null]> = [];
			const { getByLabelText, container } = render(FocusEvents, {
				props: {
					log: (label, event) =>
						records.push([label, event.type, event.target, event.relatedTarget]),
				},
			});
			const input = getByLabelText('focus target');
			const native = vi.fn((event: FocusEvent) => {
				records.push(['native', event.type, event.target, event.relatedTarget]);
				event.preventDefault();
			});
			input.addEventListener(name, native);
			const forwarded = name === 'focus' ? 'focusin' : 'focusout';
			expect(fireEvent[name](input, { relatedTarget, cancelable: true })).toBe(false);
			expect(records).toEqual([
				['native', name, input, relatedTarget],
				[`${name} capture`, forwarded, input, relatedTarget],
				[`${name} target`, forwarded, input, relatedTarget],
				[`${name} bubble`, forwarded, input, relatedTarget],
			]);
			expect(native).toHaveBeenCalledTimes(1);
			expect(container.querySelector('output')!.textContent).toBe(forwarded);
		},
	);
	it.each(['focus', 'blur'] as const)(
		'fireEvent.%s keeps the delegated pair bubbling when the native event explicitly does not',
		(name) => {
			const relatedTarget = document.createElement('button');
			const records: Array<[string, string, boolean, EventTarget | null]> = [];
			const canceled: boolean[] = [];
			const { getByLabelText, container } = render(FocusEvents, {
				props: {
					log: (label, event) => {
						records.push([label, event.type, event.bubbles, event.relatedTarget]);
						event.preventDefault();
						canceled.push(event.defaultPrevented);
					},
				},
			});
			const input = getByLabelText('focus target');
			input.addEventListener(name, (event) => {
				records.push(['native', event.type, event.bubbles, event.relatedTarget]);
			});
			const forwarded = name === 'focus' ? 'focusin' : 'focusout';
			// A canceled delegated event does not change the native helper's result.
			expect(fireEvent[name](input, { bubbles: false, cancelable: true, relatedTarget })).toBe(
				true,
			);
			expect(records).toEqual([
				['native', name, false, relatedTarget],
				[`${name} capture`, forwarded, true, relatedTarget],
				[`${name} target`, forwarded, true, relatedTarget],
				[`${name} bubble`, forwarded, true, relatedTarget],
			]);
			expect(canceled).toEqual([true, true, true]);
			expect(container.querySelector('output')!.textContent).toBe(forwarded);
		},
	);
	it.each(['focus', 'blur'] as const)(
		'keeps the DOM-only %s helper as a single native event',
		(name) => {
			const log = vi.fn();
			const { getByLabelText, container } = render(FocusEvents, { props: { log } });
			const input = getByLabelText('focus target');
			const native = vi.fn();
			input.addEventListener(name, native);
			domFireEvent[name](input);
			expect(native).toHaveBeenCalledTimes(1);
			expect(log).not.toHaveBeenCalled();
			expect(container.querySelector('output')!.textContent).toBe('idle');
		},
	);
});
