import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot, startTransition } from 'octane';
import { initializeHydrationEventCapture } from 'octane/hydration';
import { renderToString } from 'octane/server';
import { flushEffects, mount } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import { LayoutReadinessApp } from '../_fixtures/view-transition-matching.tsrx';
import { installViewTransitionMocks } from '../conformance/_helpers/view-transition-mocks.js';
import * as client from './_fixtures/deferred-controlled-editor.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/hydration/_fixtures/deferred-controlled-editor.tsrx',
);

describe('deferred controlled editor', () => {
	let container: HTMLElement;
	let root: ReturnType<typeof hydrateRoot> | undefined;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		root?.unmount();
		root = undefined;
		container.remove();
	});

	it.each([
		{ adoptInLayout: false, send: false },
		{ adoptInLayout: false, send: true },
		{ adoptInLayout: true, send: false },
		{ adoptInLayout: true, send: true },
	])(
		'preserves the adopted draft through queued input and Send events (layout adoption: $adoptInLayout, Send: $send)',
		async ({ adoptInLayout, send }) => {
			container.innerHTML = renderToString(server.DeferredControlledEditor, { adoptInLayout }).html;
			const input = container.querySelector('input')!;
			const button = container.querySelector('button')!;
			const onAdopt = vi.fn();
			const onSend = vi.fn();
			const draft = 'A draft typed before hydration';

			initializeHydrationEventCapture(document);
			input.focus();
			input.value = 'A draft';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.value = draft;
			input.setSelectionRange(3, 8);
			input.dispatchEvent(new Event('input', { bubbles: true }));
			if (send) button.click();

			root = hydrateRoot(container, client.DeferredControlledEditor, {
				adoptInLayout,
				onAdopt,
				onSend,
			});
			flushSync(() => {});
			flushEffects();
			await act(() => {});

			expect(container.querySelector('input')).toBe(input);
			expect(container.querySelector('button')).toBe(button);
			if (adoptInLayout) {
				expect(onAdopt).toHaveBeenCalledWith(draft);
			} else {
				expect(onAdopt).not.toHaveBeenCalled();
			}
			expect(input.value).toBe(draft);
			expect(container.querySelector('#deferred-draft')!.textContent).toBe(draft);
			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([3, 8]);
			if (send) {
				expect(onSend).toHaveBeenCalledExactlyOnceWith(draft);
				expect(container.querySelector('#deferred-submitted')!.textContent).toBe(draft);
			} else {
				expect(onSend).not.toHaveBeenCalled();
				expect(container.querySelector('#deferred-submitted')!.textContent).toBe('');
			}
		},
	);

	it('restores a rejected edit dispatched by a layout effect before the flush returns', () => {
		const view = mount(client.LockedEditor, { dispatchInLayout: true });
		try {
			expect(view.container.querySelector('input')!.value).toBe('locked');
		} finally {
			view.unmount();
		}
	});

	it('keeps the native edit visible to a handler that flushes before rejecting it', () => {
		const observed: string[] = [];
		const view = mount(client.LockedEditor, {
			onInput(event: Event) {
				flushSync(() => {});
				observed.push((event.currentTarget as HTMLInputElement).value);
			},
		});
		try {
			const input = view.container.querySelector('input')!;
			input.value = 'rejected edit';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			expect(observed).toEqual(['rejected edit']);
			expect(input.value).toBe('locked');
		} finally {
			view.unmount();
		}
	});

	it('keeps an accepted edit while another root finishes its deferred layout', async () => {
		const transition = installViewTransitionMocks();
		const transitionRoot = createRoot(container);
		let setDraft!: (value: string) => void;
		const editor = mount(client.PendingControlledEditor, {
			expose: (setter: typeof setDraft) => (setDraft = setter),
		});
		const input = editor.container.querySelector('input')!;
		const afterCapture: string[] = [];
		const draft = 'accepted while another root commits';
		(
			document as unknown as {
				startViewTransition: (options: { update: () => unknown }) => unknown;
			}
		).startViewTransition = (options) => {
			// Work queued after preparation belongs to the later root's commit.
			setDraft(draft);
			const ready = Promise.resolve(options.update());
			afterCapture.push(input.value);
			return { ready, finished: ready, skipTransition() {} };
		};
		try {
			const props = {
				events: [] as string[],
				requestFont: () => {},
				onLayout(text: string) {
					if (text === 'after') {
						input.value = draft;
						input.dispatchEvent(new Event('input', { bubbles: true }));
					}
				},
			};
			await act(() => transitionRoot.render(LayoutReadinessApp, { ...props, text: 'before' }));
			await act(() =>
				startTransition(() =>
					transitionRoot.render(LayoutReadinessApp, { ...props, text: 'after' }),
				),
			);
			expect(afterCapture).toEqual([draft]);
			expect(editor.container.querySelector('input')).toBe(input);
			expect(input.value).toBe(draft);
			expect(editor.container.querySelector('output')!.textContent).toBe(draft);
		} finally {
			transitionRoot.unmount();
			editor.unmount();
			transition.restore();
		}
	});

	it('restores a surviving editor when the layout that dispatched its edit throws', () => {
		const editor = mount(client.LockedEditor, {});
		const input = editor.container.querySelector('input')!;
		const error = new Error('layout failed after dispatch');
		const onUncaughtError = vi.fn();
		root = createRoot(container, { onUncaughtError });
		try {
			flushSync(() =>
				root!.render(client.FailingLayout, {
					dispatch() {
						input.value = 'rejected edit';
						input.dispatchEvent(new Event('input', { bubbles: true }));
					},
					error,
				}),
			);
			expect(onUncaughtError).toHaveBeenCalledExactlyOnceWith(error);
			expect(input.isConnected).toBe(true);
			expect(input.value).toBe('locked');
		} finally {
			editor.unmount();
		}
	});

	it.each(['sync', 'scheduled'])(
		'preserves the render error and restores an edit in a surviving root (%s flush)',
		async (mode) => {
			const editor = mount(client.LockedEditor, {});
			const input = editor.container.querySelector('input')!;
			const error = new Error('render failed after layout dispatch');
			root = createRoot(container);
			try {
				const render = () =>
					root!.render(client.FailingLayout, {
						dispatch() {
							input.value = 'rejected edit';
							input.dispatchEvent(new Event('input', { bubbles: true }));
						},
						error,
						failDuringRender: true,
					});
				if (mode === 'sync') {
					expect(() => flushSync(render)).toThrow(error);
				} else {
					await expect(
						act(async () => {
							render();
							await Promise.resolve();
						}),
					).rejects.toThrow(error);
				}
				expect(input.isConnected).toBe(true);
				expect(input.value).toBe('locked');
			} finally {
				editor.unmount();
			}
		},
	);
});
