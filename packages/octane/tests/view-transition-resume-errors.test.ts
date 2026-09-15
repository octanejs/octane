import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, flushSync, startTransition, type Root } from '../src/index.js';
import { act } from './_helpers';
import {
	installViewTransitionMocks,
	type ViewTransitionMocks,
} from './conformance/_helpers/view-transition-mocks';
import {
	EnteringBoundaryApp,
	RenderFailureApp,
	ResumeBatchApp,
	UnsupportedScopeFailureApp,
} from './_fixtures/view-transition-resume-errors.tsrx';

describe('ViewTransition resume batches and caller errors', () => {
	let mocks: ViewTransitionMocks;
	let container: HTMLDivElement;
	let root: Root;
	let recoverable: unknown[];
	let originalElementStart: PropertyDescriptor | undefined;

	beforeEach(() => {
		mocks = installViewTransitionMocks();
		originalElementStart = Object.getOwnPropertyDescriptor(
			Element.prototype,
			'startViewTransition',
		);
		Reflect.deleteProperty(Element.prototype, 'startViewTransition');
		container = document.createElement('div');
		document.body.append(container);
		recoverable = [];
		root = createRoot(container, {
			onRecoverableError(error) {
				recoverable.push(error);
			},
		});
	});

	afterEach(async () => {
		flushSync(() => root.unmount());
		await act(() => {});
		container.remove();
		if (originalElementStart === undefined)
			Reflect.deleteProperty(Element.prototype, 'startViewTransition');
		else Object.defineProperty(Element.prototype, 'startViewTransition', originalElementStart);
		mocks.restore();
		vi.restoreAllMocks();
	});

	it.each(['queued transition', 'no queued work', 'urgent passive'])(
		'commits a resume with pending passive work (%s)',
		async (mode) => {
			const controls: Record<string, (value: string) => void> = {};
			const events: string[] = [];
			const listeners: Array<() => void> = [];
			let resolved = false;
			const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
			const thenable = {
				then(resolve: () => void) {
					listeners.push(resolve);
				},
			};
			const captures: Array<{ owner: string; update: () => void | Promise<void> }> = [];
			Object.defineProperty(Element.prototype, 'startViewTransition', {
				configurable: true,
				value(
					this: Element,
					input: (() => void | Promise<void>) | { update: () => void | Promise<void> },
				) {
					captures.push({
						owner: this.getAttribute('data-owner')!,
						update: typeof input === 'function' ? input : input.update,
					});
					let finish!: () => void;
					const finished = new Promise<void>((resolve) => {
						finish = resolve;
					});
					return { ready: finished, finished, skipTransition: finish };
				},
			});
			flushSync(() =>
				root.render(ResumeBatchApp, {
					controls,
					events,
					passiveUrgent: mode === 'urgent passive',
					read() {
						if (!resolved) throw thenable;
						return 'Resolved';
					},
				}),
			);
			expect(container.querySelector('[data-value="resume"]')!.textContent).toBe('Waiting');
			expect(events).toEqual([]);
			// Let the retry enter its commit window before the queued render's
			// microtask. The previous commit's passives have not painted yet.
			clock.mockReturnValue(1000);
			resolved = true;
			for (const listener of [...listeners]) listener();
			if (mode !== 'no queued work') startTransition(() => controls.queued('already queued'));
			await Promise.resolve();
			expect(events).toEqual(['passive']);
			expect(captures.map(({ owner }) => owner).sort()).toEqual(
				mode === 'urgent passive'
					? []
					: mode === 'no queued work'
						? ['passive', 'resume']
						: ['passive', 'queued', 'resume'],
			);
			if (mode !== 'urgent passive') {
				expect(container.querySelector('[data-value="queued"]')!.textContent).toBe('initial');
				expect(container.querySelector('[data-value="passive"]')!.textContent).toBe('initial');
			}
			await Promise.all(captures.map((capture) => capture.update()));
			expect(container.querySelector('[data-value="resume"]')!.textContent).toBe('Resolved');
			expect(container.querySelector('[data-value="queued"]')!.textContent).toBe(
				mode === 'no queued work' ? 'initial' : 'already queued',
			);
			expect(container.querySelector('[data-value="passive"]')!.textContent).toBe('from passive');
		},
	);

	it('preserves an undefined render error for the caller', async () => {
		await act(() => root.render(RenderFailureApp, { fail: false, error: undefined }));
		await expect(
			act(() =>
				startTransition(() => root.render(RenderFailureApp, { fail: true, error: undefined })),
			),
		).rejects.toBeUndefined();
		expect(mocks.calls).toHaveLength(0);
		expect(recoverable).toEqual([]);
	});

	it.each([new Error('layout cascade failed'), undefined])(
		'preserves a layout-driven render error when element capture is unsupported (%s)',
		async (error) => {
			await act(() => root.render(UnsupportedScopeFailureApp, { fail: false, error }));
			await expect(
				act(() =>
					startTransition(() => root.render(UnsupportedScopeFailureApp, { fail: true, error })),
				),
			).rejects.toBe(error);
			expect(mocks.calls).toHaveLength(0);
			expect(recoverable).toEqual([]);
		},
	);

	it.each(['start', 'ready and finished'])(
		'reports a native undefined failure once (%s)',
		async (phase) => {
			await act(() => root.render(RenderFailureApp, { fail: false, error: null }));
			Object.defineProperty(document, 'startViewTransition', {
				configurable: true,
				value(input: (() => void | Promise<void>) | { update: () => void | Promise<void> }) {
					if (phase === 'start') throw undefined;
					(typeof input === 'function' ? input : input.update)();
					const rejected = Promise.reject(undefined);
					return { ready: rejected, finished: rejected, skipTransition() {} };
				},
			});
			await act(() =>
				startTransition(() =>
					root.render(RenderFailureApp, { fail: false, error: null, label: 'Changed' }),
				),
			);
			expect(container.textContent).toBe('Changed');
			expect(recoverable).toEqual([undefined]);
		},
	);

	it('reports a native start failure to the root of an entering boundary', async () => {
		await act(() => root.render(EnteringBoundaryApp, { show: false }));
		const error = new Error('native capture failed');
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		Object.defineProperty(document, 'startViewTransition', {
			configurable: true,
			value() {
				throw error;
			},
		});
		await act(() => startTransition(() => root.render(EnteringBoundaryApp, { show: true })));
		expect(container.textContent).toBe('Entered');
		expect(recoverable).toEqual([error]);
		expect(consoleError).not.toHaveBeenCalled();
	});
});
