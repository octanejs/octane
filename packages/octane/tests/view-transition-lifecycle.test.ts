import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createElement,
	createRoot,
	flushSync,
	startTransition,
	ViewTransition,
	type Root,
	type ViewTransitionInstance,
} from '../src/index.js';
import {
	installViewTransitionMocks,
	type ViewTransitionMocks,
} from './conformance/_helpers/view-transition-mocks';
import { MatchingApp } from './_fixtures/view-transition-matching.tsrx';

function deferred<T = void>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

describe('ViewTransition public lifecycle', () => {
	let mocks: ViewTransitionMocks;
	let container: HTMLDivElement;
	let root: Root;
	const recoverable: unknown[] = [];
	const handles: Array<{
		update(): void | Promise<void>;
		ready: ReturnType<typeof deferred<void>>;
		finished: ReturnType<typeof deferred<void>>;
		skip: ReturnType<typeof vi.fn>;
	}> = [];
	beforeEach(() => {
		mocks = installViewTransitionMocks();
		container = document.createElement('div');
		document.body.append(container);
		root = createRoot(container, {
			onRecoverableError: (error) => {
				recoverable.push(error);
			},
		});
		recoverable.length = 0;
		handles.length = 0;
		(document as any).startViewTransition = (options: { update(): void | Promise<void> }) => {
			const ready = deferred();
			const finished = deferred();
			const skip = vi.fn();
			handles.push({ update: options.update, ready, finished, skip });
			return { ready: ready.promise, finished: finished.promise, skipTransition: skip };
		};
	});
	afterEach(async () => {
		flushSync(() => root.unmount());
		for (const handle of handles) {
			handle.ready.resolve();
			handle.finished.resolve();
		}
		await Promise.resolve();
		container.remove();
		delete (document as any).__octaneViewTransition;
		mocks.restore();
	});

	it('keeps auto instance identity across updates and detaches replaced or removed refs', () => {
		const first = { current: null as ViewTransitionInstance | null };
		const second = { current: null as ViewTransitionInstance | null };
		flushSync(() =>
			root.render(MatchingApp, { text: 'a', transition: { name: 'auto', ref: first } }),
		);
		const instance = first.current!;
		expect(instance).not.toBeNull();
		expect(instance.name).not.toBe('auto');
		flushSync(() =>
			root.render(MatchingApp, { text: 'b', transition: { name: 'auto', ref: second } }),
		);
		expect(first.current).toBeNull();
		expect(second.current).toBe(instance);
		flushSync(() => root.render(MatchingApp, { text: 'c', transition: {} }));
		expect(second.current).toBeNull();
	});

	it('runs callback cleanup at finished even when its boundary has unmounted', async () => {
		const events: string[] = [];
		const transition = {
			onExit: () => {
				events.push('exit');
				return () => {
					events.push('cleanup');
				};
			},
		};
		root.render(MatchingApp, { text: 'before', transition });
		startTransition(() => root.render(MatchingApp, { text: 'after', show: false, transition }));
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		await handles[0].update();
		handles[0].ready.resolve();
		await vi.waitFor(() => expect(events).toEqual(['exit']));
		expect(container.querySelector('[data-vt-target]')).toBeNull();
		handles[0].finished.resolve();
		await vi.waitFor(() => expect(events).toEqual(['exit', 'cleanup']));
	});

	it('preserves urgent output when a skipped old update callback runs late', async () => {
		root.render(MatchingApp, { text: 'before', transition: {} });
		startTransition(() => root.render(MatchingApp, { text: 'transition', transition: {} }));
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		flushSync(() => root.render(MatchingApp, { text: 'urgent', transition: {} }));
		expect(container.textContent).toBe('urgenturgent');
		await handles[0].update();
		expect(container.textContent).toBe('urgenturgent');
		expect(handles[0].skip).toHaveBeenCalled();
	});

	it('reports capture errors through the root and still commits exactly once', async () => {
		root.render(MatchingApp, { text: 'before', transition: {} });
		startTransition(() => root.render(MatchingApp, { text: 'after', transition: {} }));
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		const error = new DOMException('Duplicate view-transition-name: hero', 'InvalidStateError');
		handles[0].ready.reject(error);
		await vi.waitFor(() => expect(recoverable).toEqual([error]));
		expect(container.textContent).toBe('afterafter');
		await handles[0].update();
		expect(container.textContent).toBe('afterafter');
		handles[0].finished.resolve();
	});

	it('commits without animation when the native options overload is unsupported', async () => {
		(document as any).startViewTransition = () => {
			throw new TypeError('callback required');
		};
		root.render(MatchingApp, { text: 'before', transition: {} });
		startTransition(() => root.render(MatchingApp, { text: 'after', transition: {} }));
		await vi.waitFor(() => expect(container.textContent).toBe('afterafter'));
		expect(container.querySelector<HTMLElement>('[data-vt-target]')!.style.viewTransitionName).toBe(
			'',
		);
	});

	it('waits for a streamed transition before starting a client transition', async () => {
		const finished = deferred();
		const streamed = {
			ready: Promise.resolve(),
			finished: finished.promise,
			skipTransition: vi.fn(),
		};
		(document as any).__octaneViewTransition = streamed;
		root.render(MatchingApp, { text: 'before', transition: {} });
		startTransition(() => root.render(MatchingApp, { text: 'after', transition: {} }));
		await Promise.resolve();
		await Promise.resolve();
		expect(container.textContent).toBe('beforebefore');
		expect(handles).toHaveLength(0);
		finished.resolve();
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		await handles[0].update();
		expect(container.textContent).toBe('afterafter');
	});

	it('detects descriptor attribute and controlled-property updates with unchanged geometry', async () => {
		const events: string[] = [];
		const render = (title: string, value: string) =>
			createElement(
				ViewTransition,
				{
					onUpdate: () => {
						events.push('update');
					},
				},
				createElement('input', { title, value, onInput() {} }),
			);
		root.render(render('before', 'a'));
		startTransition(() => root.render(render('after', 'b')));
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		await handles[0].update();
		handles[0].ready.resolve();
		await vi.waitFor(() => expect(events).toEqual(['update']));
		expect(container.querySelector('input')!.value).toBe('b');
		expect(container.querySelector('input')!.title).toBe('after');
	});
});
