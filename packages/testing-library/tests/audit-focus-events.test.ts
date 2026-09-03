import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { fireEvent as domFireEvent } from '@testing-library/dom';
import { FocusEvents } from './_fixtures/focus-events.tsrx';

afterEach(cleanup);

describe('delegated native focus helpers', () => {
	it.each(['focus', 'blur'] as const)(
		'fireEvent.%s delivers native and delegated focus events once',
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
			const native = vi.fn((event: Event) => event.preventDefault());
			input.addEventListener(name, native);
			const forwarded = name === 'focus' ? 'focusin' : 'focusout';
			expect(fireEvent[name](input, { relatedTarget, cancelable: true })).toBe(false);
			expect(records).toEqual([
				[`${name} capture`, forwarded, input, relatedTarget],
				[`${name} target`, forwarded, input, relatedTarget],
				[`${name} bubble`, forwarded, input, relatedTarget],
			]);
			expect(native).toHaveBeenCalledTimes(1);
			expect(container.querySelector('output')!.textContent).toBe(forwarded);
		},
	);
	it('keeps the DOM-only focus helper as a single native event', () => {
		const log = vi.fn();
		const { getByLabelText, container } = render(FocusEvents, { props: { log } });
		const input = getByLabelText('focus target');
		const native = vi.fn();
		input.addEventListener('focus', native);
		domFireEvent.focus(input);
		expect(native).toHaveBeenCalledTimes(1);
		expect(log).not.toHaveBeenCalled();
		expect(container.querySelector('output')!.textContent).toBe('idle');
	});
});
