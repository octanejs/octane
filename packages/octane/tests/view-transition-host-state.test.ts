import { describe, expect, it, vi } from 'vitest';
import { createRoot, flushSync, startTransition } from '../src/index.js';
import { act } from './_helpers';
import { installViewTransitionMocks } from './conformance/_helpers/view-transition-mocks';
import { HostStateApp } from './_fixtures/view-transition-host-state.tsrx';

describe('animated host updates', () => {
	it.each([false, true])(
		'publishes controlled form state and preserves urgent interruption (interrupt=%s)',
		async (interrupt) => {
			const mocks = installViewTransitionMocks();
			const container = document.createElement('div');
			document.body.append(container);
			const root = createRoot(container);
			let update: (() => void | Promise<void>) | undefined;
			let ready!: () => void;
			let finish!: () => void;
			const readyPromise = new Promise<void>((resolve) => {
				ready = resolve;
			});
			const finishedPromise = new Promise<void>((resolve) => {
				finish = resolve;
			});
			Object.defineProperty(document, 'startViewTransition', {
				configurable: true,
				value(input: { update: () => void | Promise<void> }) {
					update = input.update;
					return {
						ready: readyPromise,
						finished: finishedPromise,
						skipTransition() {
							ready();
							finish();
						},
					};
				},
			});
			const inputs: string[] = [];
			const props = {
				rows: ['a', 'b', 'c'],
				choice: 'a',
				className: 'before',
				color: 'red',
				html: '<b>before</b>',
				onInput: (value: string) => inputs.push(value),
			};
			try {
				await act(() => root.render(HostStateApp, props));
				const retained = container.querySelector('[data-row="b"]');
				const beforeRaw = container.querySelector('[data-raw]')!.firstChild;
				startTransition(() =>
					root.render(HostStateApp, {
						...props,
						rows: ['d', 'b', 'c'],
						choice: 'external',
						className: 'after',
						color: 'blue',
						html: '<i>after</i>',
					}),
				);
				await vi.waitFor(() => expect(update).toBeTypeOf('function'));
				expect(container.querySelector('section')!.className).toBe('before');
				expect(container.querySelector('input:checked')!.getAttribute('value')).toBe('a');
				expect(container.querySelector('[data-raw]')!.firstChild).toBe(beforeRaw);
				if (interrupt)
					flushSync(() =>
						root.render(HostStateApp, { ...props, choice: 'b', className: 'urgent' }),
					);
				await update!();
				ready();
				finish();
				await act(async () => {});
				if (interrupt) {
					expect(container.querySelector('section')!.className).toBe('urgent');
					expect(container.querySelector<HTMLInputElement>('input:checked')!.value).toBe('b');
					expect(container.querySelector('[data-row="b"]')).toBe(retained);
					return;
				}
				expect(container.querySelector('section')!.className).toBe('after');
				expect(container.querySelector('section')!.style.color).toBe('blue');
				expect(
					[...container.querySelectorAll('[data-row]')].map((node) =>
						node.getAttribute('data-row'),
					),
				).toEqual(['d', 'b', 'c']);
				expect(container.querySelector('[data-row="b"]')).toBe(retained);
				expect(container.querySelector('[data-raw]')!.innerHTML).toBe('<i>after</i>');
				const checked = container.querySelector('input:checked') as HTMLInputElement;
				expect(checked.value).toBe('external');
				expect(checked.form).toBe(container.querySelector('form'));
				checked.dispatchEvent(new Event('input', { bubbles: true }));
				expect(inputs).toEqual(['external']);
			} finally {
				flushSync(() => root.unmount());
				ready();
				finish();
				container.remove();
				mocks.restore();
			}
		},
	);
});
