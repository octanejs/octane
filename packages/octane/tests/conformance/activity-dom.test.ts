/**
 * Activity DOM contracts from React 19.2.7's Activity-test.js and
 * ReactFiberCommitWork.js, plus ReactDOMActivity-test.js at the repository's
 * pinned canary b740af2510de1e19fcb399abb862af26ff95ac80.
 * Hidden-work scheduling is intentionally different: Octane prerenders in the
 * same pass. The assertions below concern committed visibility, refs, state,
 * effects, and authored DOM values, not scheduler lanes or render counts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, flushSync, type ComponentBody } from '../../src/index.js';
import { act, flushEffects, mount, type MountResult } from '../_helpers';
import {
	ActivityAsyncHost,
	ActivityDescriptorRefHost,
	ActivityGuardedRefHost,
	ActivityInsertionAsyncHost,
	ActivityInsertionRetryHost,
	ActivityNestedInsertionRetryHost,
	ActivityPortalHost,
	ActivityRefHost,
	ActivityRepeatedInsertionHost,
	ActivitySuspensePortalHost,
	ActivityStatefulAsyncHost,
	ActivityValuesHost,
	NestedActivityRefHost,
	NestedPortalActivityHost,
	type ActivityMode,
	type ButtonReference,
	type InputReference,
} from './_fixtures/activity-dom.tsrx';

const roots: MountResult[] = [];
const targets: Element[] = [];

function render<P>(body: ComponentBody<P>, props: P): MountResult {
	const result = mount(body, props);
	roots.push(result);
	flushEffects();
	return result;
}

function unmount(result: MountResult): void {
	const index = roots.indexOf(result);
	if (index !== -1) roots.splice(index, 1);
	result.unmount();
}

function target(): HTMLDivElement {
	const element = document.createElement('div');
	document.body.appendChild(element);
	targets.push(element);
	return element;
}

function find<T extends HTMLElement = HTMLElement>(container: ParentNode, selector: string): T {
	const element = container.querySelector(selector);
	if (element === null) throw new Error(`Missing ${selector}`);
	return element as T;
}

function directText(container: Element): string {
	return Array.from(container.childNodes)
		.filter((node): node is Text => node.nodeType === Node.TEXT_NODE)
		.map((node) => node.data)
		.join('');
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

afterEach(() => {
	for (const root of roots.splice(0)) root.unmount();
	for (const element of targets.splice(0)) element.remove();
	flushEffects();
});

describe.each([
	['compiled hosts', ActivityRefHost],
	['element descriptors', ActivityDescriptorRefHost],
] as const)('Activity refs — %s', (_label, Host) => {
	// Per Activity-test.js:198 and ReactFiberCommitWork.js:2908/3098 (v19.2.7).
	it('attaches initially hidden refs only when the preserved hosts become visible', () => {
		const objectRef: InputReference = { current: null };
		const calls: string[] = [];
		const callbackRef: ButtonReference = (element) => {
			if (element === null) {
				calls.push('null');
				return;
			}
			calls.push('attach');
			return () => calls.push('cleanup');
		};
		const log: string[] = [];
		const props = {
			mode: 'hidden' as ActivityMode,
			objectRef,
			callbackRef,
			log: (entry: string) => log.push(entry),
		};
		const result = render(Host, props);
		const input = find<HTMLInputElement>(result.container, '#activity-ref-input');
		input.value = 'preserved draft';

		expect(objectRef.current).toBeNull();
		expect(calls).toEqual([]);
		expect(log).toEqual([]);
		expect(input.style.display).toBe('none');

		result.update(Host, { ...props, mode: 'visible' });
		flushEffects();
		expect(objectRef.current).toBe(input);
		expect(input.value).toBe('preserved draft');
		expect(calls).toEqual(['attach']);
		expect(log).toEqual(['layout mount:activity-ref-input']);

		unmount(result);
		expect(objectRef.current).toBeNull();
		expect(calls).toEqual(['attach', 'cleanup']);
	});

	// Per Activity-test.js:433 and ReactFiberCommitWork.js:2953 (v19.2.7).
	it('disconnects refs before hiding and reconnects only the latest refs on reveal', () => {
		const objectRef: InputReference = { current: null };
		const nextObjectRef: InputReference = { current: null };
		const calls: string[] = [];
		const callbackRef: ButtonReference = (element) => {
			if (element === null) {
				calls.push('old:null');
				return;
			}
			calls.push('old:attach');
			return () => {
				calls.push(`old:cleanup:${element.isConnected}:${element.style.display}`);
			};
		};
		const nextCallbackRef: ButtonReference = (element) => {
			if (element === null) {
				calls.push('next:null');
				return;
			}
			calls.push('next:attach');
			return () => calls.push('next:cleanup');
		};
		const log: string[] = [];
		const props = {
			mode: 'visible' as ActivityMode,
			objectRef,
			callbackRef,
			log: (entry: string) => log.push(entry),
		};
		const result = render(Host, props);
		const input = objectRef.current!;
		const button = find<HTMLButtonElement>(result.container, '#activity-ref-button');
		input.value = 'user draft';
		calls.length = 0;
		log.length = 0;

		result.update(Host, { ...props, mode: 'hidden' });
		flushEffects();
		expect(log).toEqual(['layout cleanup:activity-ref-input']);
		expect(objectRef.current).toBeNull();
		expect(calls).toEqual(['old:cleanup:true:']);
		expect(button.style.display).toBe('none');
		expect(find(result.container, '#activity-ref-input')).toBe(input);

		const next = {
			...props,
			mode: 'hidden' as ActivityMode,
			objectRef: nextObjectRef,
			callbackRef: nextCallbackRef,
		};
		result.update(Host, next);
		flushEffects();
		expect(nextObjectRef.current).toBeNull();
		expect(calls).toEqual(['old:cleanup:true:']);

		result.update(Host, { ...next, mode: 'visible' });
		flushEffects();
		expect(objectRef.current).toBeNull();
		expect(nextObjectRef.current).toBe(input);
		expect(input.value).toBe('user draft');
		expect(find(result.container, '#activity-ref-button')).toBe(button);
		expect(calls).toEqual(['old:cleanup:true:', 'next:attach']);
		expect(log).toEqual(['layout cleanup:activity-ref-input', 'layout mount:activity-ref-input']);

		result.update(Host, next);
		flushEffects();
		expect(nextObjectRef.current).toBeNull();
		expect(calls).toEqual(['old:cleanup:true:', 'next:attach', 'next:cleanup']);
		unmount(result);
		expect(calls).toEqual(['old:cleanup:true:', 'next:attach', 'next:cleanup']);
	});

	// Per ReactFiberCommitWork.js disappearLayoutEffects (v19.2.7).
	it('disconnects the committed ref when the hide render replaces or removes it', () => {
		const calls: string[] = [];
		const oldRef: ButtonReference = (element) => {
			if (element === null) return;
			calls.push('old:attach');
			return () => calls.push('old:cleanup:' + element.style.display);
		};
		const nextRef: ButtonReference = (element) => {
			if (element === null) return;
			calls.push('next:attach');
			return () => calls.push('next:cleanup:' + element.style.display);
		};
		const props = {
			mode: 'visible' as ActivityMode,
			objectRef: { current: null } as InputReference,
			callbackRef: oldRef,
			log: () => {},
		};
		const result = render(Host, props);
		const button = find(result.container, '#activity-ref-button');
		result.update(Host, { ...props, mode: 'hidden', callbackRef: nextRef });
		expect(calls).toEqual(['old:attach', 'old:cleanup:']);
		expect(button.style.display).toBe('none');
		result.update(Host, { ...props, callbackRef: nextRef });
		expect(calls).toEqual(['old:attach', 'old:cleanup:', 'next:attach']);
		result.update(Host, { ...props, mode: 'hidden', callbackRef: null });
		expect(calls).toEqual(['old:attach', 'old:cleanup:', 'next:attach', 'next:cleanup:']);
		result.update(Host, { ...props, callbackRef: null });
		expect(find(result.container, '#activity-ref-button')).toBe(button);
		unmount(result);
		expect(calls).toEqual(['old:attach', 'old:cleanup:', 'next:attach', 'next:cleanup:']);
	});
});

describe('Activity ref cleanup errors', () => {
	// Per ReactErrorBoundaries-test.internal.js:2782 and Activity disappearance.
	it('routes a throwing ref cleanup to its error boundary without skipping other refs', () => {
		const container = target();
		const error = new Error('Activity ref cleanup failed');
		const reports: unknown[] = [];
		const calls: string[] = [];
		const root = createRoot(container, { onCaughtError: (value) => reports.push(value) });
		const first: ButtonReference = (element) => {
			if (element === null) return;
			return () => {
				calls.push('first:cleanup');
				throw error;
			};
		};
		const second: ButtonReference = (element) => {
			if (element === null) return;
			return () => calls.push('second:cleanup');
		};
		try {
			flushSync(() => root.render(ActivityGuardedRefHost, { mode: 'visible', first, second }));
			expect(() =>
				flushSync(() =>
					root.render(ActivityGuardedRefHost, {
						mode: 'hidden',
						first,
						second,
					}),
				),
			).not.toThrow();
			expect(container.querySelector('#activity-guarded-error')?.textContent).toBe(error.message);
			expect(container.querySelector('#activity-guarded-second')).toBeNull();
			expect(calls).toEqual(['first:cleanup', 'second:cleanup']);
			expect(reports).toEqual([error]);
		} finally {
			root.unmount();
		}
		expect(calls).toEqual(['first:cleanup', 'second:cleanup']);
	});

	// Disappearance cleanups may synchronously delete their own root.
	it('finishes a reentrant unmount without repeating hidden ref cleanup', async () => {
		const calls: string[] = [];
		let result!: MountResult;
		const first: ButtonReference = (element) => {
			if (element === null) return;
			return () => {
				calls.push('first:cleanup');
				unmount(result);
			};
		};
		const second: ButtonReference = (element) => {
			if (element === null) return;
			return () => calls.push('second:cleanup');
		};
		result = render(ActivityGuardedRefHost, { mode: 'visible', first, second });
		const container = result.container;
		result.update(ActivityGuardedRefHost, { mode: 'hidden', first, second });
		expect(container.isConnected).toBe(false);
		expect(container.textContent).toBe('');
		expect(calls).toEqual(['first:cleanup', 'second:cleanup']);
		await act(async () => {});
		const objectRef: InputReference = { current: null };
		const next = render(ActivityRefHost, {
			mode: 'hidden',
			objectRef,
			callbackRef: null,
			log: () => {},
		});
		expect(objectRef.current).toBeNull();
		next.update(ActivityRefHost, {
			mode: 'visible',
			objectRef,
			callbackRef: null,
			log: () => {},
		});
		expect(objectRef.current).toBe(find(next.container, '#activity-ref-input'));
		unmount(next);
		expect(objectRef.current).toBeNull();
		expect(calls).toEqual(['first:cleanup', 'second:cleanup']);
	});
});

describe('Activity authored DOM values', () => {
	// Per Activity-test.js:550 (v19.2.7): the boundary overrides visibility,
	// while reveal must use the child's latest authored property value.
	it('restores display updates made while the same host remains hidden', () => {
		const props = {
			mode: 'visible' as ActivityMode,
			display: 'inline-flex',
			color: 'red',
			text: '',
		};
		const result = render(ActivityValuesHost, props);
		const element = find(result.container, '#activity-values-styled');
		result.update(ActivityValuesHost, { ...props, mode: 'hidden' });
		result.update(ActivityValuesHost, {
			...props,
			mode: 'hidden',
			display: 'grid',
			color: 'blue',
		});
		expect(element.style.display).toBe('none');
		expect(element.style.color).toBe('blue');

		result.update(ActivityValuesHost, {
			...props,
			display: 'grid',
			color: 'blue',
		});
		expect(find(result.container, '#activity-values-styled')).toBe(element);
		expect(element.style.display).toBe('grid');
		expect(element.style.color).toBe('blue');
	});

	// Per Activity-test.js:550 (v19.2.7).
	it('preserves removal of an authored display value while hidden', () => {
		const props = {
			mode: 'hidden' as ActivityMode,
			display: 'inline-flex' as string | undefined,
			color: 'red',
			text: '',
		};
		const result = render(ActivityValuesHost, props);
		const element = find(result.container, '#activity-values-styled');
		result.update(ActivityValuesHost, { ...props, display: undefined });
		expect(element.style.display).toBe('none');
		result.update(ActivityValuesHost, { ...props, display: undefined, mode: 'visible' });
		expect(element.style.display).toBe('');
		expect(element.style.color).toBe('red');
	});

	// Per https://react.dev/reference/react/Activity#caveats (bare-text children).
	it('restores the latest bare text after updates made while hidden', () => {
		const props = {
			mode: 'visible' as ActivityMode,
			display: undefined,
			color: 'red',
			text: 'old text',
		};
		const result = render(ActivityValuesHost, props);
		const host = find(result.container, '#activity-values');
		expect(directText(host)).toBe('old text');
		result.update(ActivityValuesHost, { ...props, mode: 'hidden' });
		result.update(ActivityValuesHost, { ...props, mode: 'hidden', text: 'latest text' });
		expect(directText(host)).toBe('');
		result.update(ActivityValuesHost, { ...props, text: 'latest text' });
		expect(directText(host)).toBe('latest text');
	});
});

describe('nested Activity refs', () => {
	// Per Activity-test.js:1362 and ReactFiberCommitWork.js:2962 (v19.2.7).
	it('keeps refs disconnected until every enclosing Activity is visible', () => {
		const objectRef: InputReference = { current: null };
		const calls: string[] = [];
		const callbackRef: ButtonReference = (element) => {
			if (element === null) return;
			calls.push('attach');
			return () => calls.push('cleanup');
		};
		const props = {
			mode: 'hidden' as ActivityMode,
			inner: 'hidden' as ActivityMode,
			objectRef,
			callbackRef,
			log: () => {},
		};
		const result = render(NestedActivityRefHost, props);
		const input = find<HTMLInputElement>(result.container, '#activity-ref-input');
		expect(objectRef.current).toBeNull();
		result.update(NestedActivityRefHost, { ...props, inner: 'visible' });
		expect(objectRef.current).toBeNull();
		expect(calls).toEqual([]);
		result.update(NestedActivityRefHost, { ...props, mode: 'visible', inner: 'visible' });
		expect(objectRef.current).toBe(input);
		expect(calls).toEqual(['attach']);

		result.update(NestedActivityRefHost, props);
		expect(objectRef.current).toBeNull();
		expect(calls).toEqual(['attach', 'cleanup']);
		result.update(NestedActivityRefHost, { ...props, mode: 'visible' });
		expect(objectRef.current).toBeNull();
		expect(calls).toEqual(['attach', 'cleanup']);
		result.update(NestedActivityRefHost, { ...props, mode: 'visible', inner: 'visible' });
		expect(objectRef.current).toBe(input);
		expect(calls).toEqual(['attach', 'cleanup', 'attach']);
	});
});

describe('Activity portal visibility', () => {
	// Per ReactDOMActivity-test.js:57/388 (React canary).
	it('hides deeply nested portals and restores their DOM, state, and effects', () => {
		const portalTarget = target();
		const nestedTarget = target();
		const log: string[] = [];
		const props = {
			mode: 'visible' as ActivityMode,
			target: portalTarget,
			secondTarget: nestedTarget,
			showPortal: true,
			items: ['a'],
			display: 'inline-flex',
			log: (entry: string) => log.push(entry),
		};
		const result = render(ActivityPortalHost, props);
		const item = find<HTMLButtonElement>(portalTarget, '#activity-portal-a');
		const nested = find(nestedTarget, '#activity-portal-nested');
		flushSync(() => item.click());
		expect(item.textContent).toBe('a:1');
		log.length = 0;

		result.update(ActivityPortalHost, { ...props, mode: 'hidden' });
		flushEffects();
		expect(find(result.container, '#activity-portal-inline').style.display).toBe('none');
		expect(item.style.display).toBe('none');
		expect(nested.style.display).toBe('none');
		expect(log.sort()).toEqual([
			'layout cleanup:a',
			'layout cleanup:nested',
			'passive cleanup:a',
			'passive cleanup:nested',
		]);
		log.length = 0;

		result.update(ActivityPortalHost, props);
		flushEffects();
		expect(find(portalTarget, '#activity-portal-a')).toBe(item);
		expect(find(nestedTarget, '#activity-portal-nested')).toBe(nested);
		expect(item.textContent).toBe('a:1');
		expect(item.style.display).toBe('inline-flex');
		expect(nested.style.display).toBe('inline-flex');
		expect(log.sort()).toEqual([
			'layout mount:a',
			'layout mount:nested',
			'passive mount:a',
			'passive mount:nested',
		]);
	});

	// Per ReactDOMActivity-test.js:152/218/437 (React canary).
	it('keeps new portals and inserted portal children hidden until reveal', () => {
		const portalTarget = target();
		const log: string[] = [];
		const props = {
			mode: 'hidden' as ActivityMode,
			target: portalTarget,
			showPortal: false,
			items: ['a'],
			display: 'inline-flex',
			log: (entry: string) => log.push(entry),
		};
		const result = render(ActivityPortalHost, props);
		expect(portalTarget.querySelector('#activity-portal-a')).toBeNull();
		result.update(ActivityPortalHost, { ...props, showPortal: true });
		flushEffects();
		const item = find(portalTarget, '#activity-portal-a');
		expect(item.style.display).toBe('none');
		expect(log).toEqual([]);

		const updated = { ...props, showPortal: true, items: ['a', 'b'], display: 'grid' };
		result.update(ActivityPortalHost, updated);
		flushEffects();
		const added = find(portalTarget, '#activity-portal-b');
		expect(item.style.display).toBe('none');
		expect(added.style.display).toBe('none');
		expect(log).toEqual([]);

		result.update(ActivityPortalHost, { ...updated, mode: 'visible' });
		flushEffects();
		expect(find(portalTarget, '#activity-portal-a')).toBe(item);
		expect(find(portalTarget, '#activity-portal-b')).toBe(added);
		expect(item.style.display).toBe('grid');
		expect(added.style.display).toBe('grid');
		expect(log.sort()).toEqual([
			'layout mount:a',
			'layout mount:b',
			'passive mount:a',
			'passive mount:b',
		]);
	});

	// Per ReactDOMActivity-test.js:102 (React canary).
	it('does not reveal a portal until both nested Activity owners are visible', () => {
		const portalTarget = target();
		const props = {
			outer: 'hidden' as ActivityMode,
			inner: 'hidden' as ActivityMode,
			target: portalTarget,
		};
		const result = render(NestedPortalActivityHost, props);
		const item = find(portalTarget, '#activity-portal-nested');
		expect(item.style.display).toBe('none');
		result.update(NestedPortalActivityHost, { ...props, inner: 'visible' });
		expect(item.style.display).toBe('none');
		result.update(NestedPortalActivityHost, {
			...props,
			outer: 'visible',
			inner: 'visible',
		});
		expect(item.style.display).toBe('inline-flex');

		result.update(NestedPortalActivityHost, props);
		result.update(NestedPortalActivityHost, { ...props, outer: 'visible' });
		expect(item.style.display).toBe('none');
		result.update(NestedPortalActivityHost, {
			...props,
			outer: 'visible',
			inner: 'visible',
		});
		expect(item.style.display).toBe('inline-flex');
	});

	// Per ReactDOMActivity-test.js:288 (React canary).
	it('keeps a portaled Suspense fallback and resumed primary hidden', () => {
		const portalTarget = target();
		let setPending!: (pending: boolean) => void;
		const props = {
			mode: 'hidden' as ActivityMode,
			target: portalTarget,
			promise: new Promise<string>(() => {}),
			expose: (setter: typeof setPending) => (setPending = setter),
		};
		const result = render(ActivitySuspensePortalHost, props);
		const primary = find(portalTarget, '#activity-portal-primary');
		expect(primary.style.display).toBe('none');
		flushSync(() => setPending(true));
		flushEffects();
		expect(find(portalTarget, '#activity-portal-pending').style.display).toBe('none');

		flushSync(() => setPending(false));
		flushEffects();
		expect(portalTarget.querySelector('#activity-portal-pending')).toBeNull();
		expect(find(portalTarget, '#activity-portal-primary')).toBe(primary);
		expect(primary.style.display).toBe('none');

		result.update(ActivitySuspensePortalHost, { ...props, mode: 'visible' });
		expect(primary.style.display).toBe('inline-flex');
		expect(find(portalTarget, '#activity-portal-ready').style.display).toBe('');
	});
});

describe('Activity background suspension', () => {
	// Per ActivitySuspense-test.js:99 (v19.2.7).
	it('does not replace visible siblings with a fallback when hidden content suspends', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => (resolve = done));
		const log: string[] = [];
		const props = {
			mode: 'hidden' as ActivityMode,
			promise,
			log: (entry: string) => log.push(entry),
		};
		const result = render(ActivityAsyncHost, props);
		const sibling = find(result.container, '#activity-async-sibling');
		expect(sibling.style.display).toBe('');
		expect(result.container.querySelector('#activity-async-fallback')).toBeNull();
		expect(log).toEqual([]);

		await act(async () => {
			resolve('ready');
			await promise;
		});
		flushEffects();
		const child = find(result.container, '#activity-async-child');
		expect(child.textContent).toBe('ready');
		expect(child.style.display).toBe('none');
		expect(result.container.querySelector('#activity-async-fallback')).toBeNull();
		expect(log).toEqual([]);

		result.update(ActivityAsyncHost, { ...props, mode: 'visible' });
		flushEffects();
		expect(find(result.container, '#activity-async-sibling')).toBe(sibling);
		expect(find(result.container, '#activity-async-child')).toBe(child);
		expect(child.style.display).toBe('');
		expect(log).toEqual(['mount']);
	});

	// Per ActivitySuspense-test.js:384 (v19.2.7).
	it('retries hidden descendant state without revealing a fallback or losing preserved input state', async () => {
		const pending = deferred<string>();
		const log: string[] = [];
		let setCount!: (value: number) => void;
		const props = {
			mode: 'hidden' as ActivityMode,
			show: true,
			promise: pending.promise,
			expose: (setter: typeof setCount) => (setCount = setter),
			log: (entry: string) => log.push(entry),
		};
		const result = render(ActivityStatefulAsyncHost, props);
		const input = find<HTMLInputElement>(result.container, '#activity-stateful-input');
		const sibling = find(result.container, '#activity-stateful-sibling');
		input.value = 'preserved edit';
		flushSync(() => setCount(1));
		expect(sibling.style.display).toBe('');
		expect(result.container.querySelector('#activity-stateful-pending')).toBeNull();
		expect(log).toEqual([]);

		// A newer state can finish the hidden tree before its promise settles.
		flushSync(() => setCount(2));
		expect(find(result.container, '#activity-stateful-input')).toBe(input);
		expect(input.value).toBe('preserved edit');
		expect(find(result.container, '#activity-stateful-value').textContent).toBe('ready:2');
		expect(input.style.display).toBe('none');
		await act(async () => {
			pending.resolve('obsolete');
			await pending.promise;
		});
		expect(result.container.querySelector('#activity-stateful-pending')).toBeNull();
		expect(log).toEqual([]);
		result.update(ActivityStatefulAsyncHost, { ...props, mode: 'visible' });
		flushEffects();
		expect(find(result.container, '#activity-stateful-sibling')).toBe(sibling);
		expect(input.value).toBe('preserved edit');
		expect(input.style.display).toBe('');
		expect(log).toEqual(['layout mount:2', 'passive mount:2']);
	});

	// Per ActivitySuspense-test.js:293 (v19.2.7).
	it('can hide already-suspended visible content and re-suspend when revealed', async () => {
		const pending = deferred<string>();
		const log: string[] = [];
		let setCount!: (value: number) => void;
		const props = {
			mode: 'visible' as ActivityMode,
			show: true,
			promise: pending.promise,
			expose: (setter: typeof setCount) => (setCount = setter),
			log: (entry: string) => log.push(entry),
		};
		const result = render(ActivityStatefulAsyncHost, props);
		const input = find<HTMLInputElement>(result.container, '#activity-stateful-input');
		const sibling = find(result.container, '#activity-stateful-sibling');
		input.value = 'kept through suspense';
		flushSync(() => setCount(1));
		expect(find(result.container, '#activity-stateful-pending').textContent).toBe('loading');
		result.update(ActivityStatefulAsyncHost, { ...props, mode: 'hidden' });
		flushEffects();
		expect(result.container.querySelector('#activity-stateful-pending')).toBeNull();
		expect(sibling.style.display).toBe('');
		expect(input.style.display).toBe('none');
		expect(log).toEqual([
			'layout mount:0',
			'passive mount:0',
			'layout cleanup:0',
			'passive cleanup:0',
		]);
		result.update(ActivityStatefulAsyncHost, props);
		expect(find(result.container, '#activity-stateful-pending').textContent).toBe('loading');
		await act(async () => {
			pending.resolve('resolved');
			await pending.promise;
		});
		flushEffects();
		expect(result.container.querySelector('#activity-stateful-pending')).toBeNull();
		expect(find(result.container, '#activity-stateful-input')).toBe(input);
		expect(input.value).toBe('kept through suspense');
		expect(input.style.display).toBe('');
		expect(find(result.container, '#activity-stateful-value').textContent).toBe('resolved:1');
		expect(log.slice(-2)).toEqual(['layout mount:1', 'passive mount:1']);
	});

	// Per ActivitySuspense-test.js:99/384: hidden suspension is not an error boundary.
	it('routes rejected hidden work to the enclosing error boundary', async () => {
		const pending = deferred<string>();
		const log: string[] = [];
		let setCount!: (value: number) => void;
		const props = {
			mode: 'hidden' as ActivityMode,
			show: true,
			promise: pending.promise,
			expose: (setter: typeof setCount) => (setCount = setter),
			log: (entry: string) => log.push(entry),
		};
		const result = render(ActivityStatefulAsyncHost, props);
		flushSync(() => setCount(1));
		expect(find(result.container, '#activity-stateful-sibling').style.display).toBe('');
		expect(result.container.querySelector('#activity-stateful-pending')).toBeNull();
		await act(async () => {
			pending.reject(new Error('background request failed'));
			await pending.promise.catch(() => {});
		});
		expect(find(result.container, '#activity-stateful-error').textContent).toBe(
			'background request failed',
		);
		expect(result.container.querySelector('#activity-stateful-input')).toBeNull();
		expect(log).toEqual([]);
	});

	// Per ActivitySuspense-test.js:99: deleting a prerender must cancel its retry.
	it('does not resurrect removed hidden work when its promise resolves', async () => {
		const pending = deferred<string>();
		const log: string[] = [];
		let setCount!: (value: number) => void;
		const props = {
			mode: 'hidden' as ActivityMode,
			show: true,
			promise: pending.promise,
			expose: (setter: typeof setCount) => (setCount = setter),
			log: (entry: string) => log.push(entry),
		};
		const result = render(ActivityStatefulAsyncHost, props);
		flushSync(() => setCount(1));
		expect(find(result.container, '#activity-stateful-sibling').style.display).toBe('');
		result.update(ActivityStatefulAsyncHost, { ...props, show: false });
		await act(async () => {
			pending.resolve('too late');
			await pending.promise;
		});
		expect(result.container.querySelector('#activity-stateful-input')).toBeNull();
		expect(result.container.querySelector('#activity-stateful-pending')).toBeNull();
		expect(find(result.container, '#activity-stateful-sibling').style.display).toBe('');
		expect(log).toEqual([]);
	});

	// Stable React 19.2.7 oracle: an insertion effect ahead of a suspending
	// sibling commits only after the hidden render completes, not on its attempt.
	it.each([
		['plain', 0],
		['plain', 1],
		['memo', 0],
		['memo', 1],
		['cached', 0],
		['cached', 1],
	] as const)(
		'does not commit insertion effects from suspended hidden work (%s, initial %s)',
		async (variant, initial) => {
			const pending = deferred<string>();
			const log: string[] = [];
			let setValue!: (value: number) => void;
			const props = {
				mode: 'hidden' as ActivityMode,
				promise: pending.promise,
				initial,
				variant,
				expose: (setter: typeof setValue) => (setValue = setter),
				log: (entry: string) => log.push(entry),
			};
			const result = render(ActivityInsertionAsyncHost, props);
			if (initial === 0) {
				expect(log).toEqual(['insertion mount:0']);
				log.length = 0;
				flushSync(() => setValue(1));
			}
			expect(find(result.container, '#activity-insertion-sibling').style.display).toBe('');
			expect(result.container.querySelector('#activity-insertion-pending')).toBeNull();
			expect(log).toEqual([]);
			await act(async () => {
				pending.resolve('ready');
				await pending.promise;
			});
			expect(log).toEqual(
				initial === 0 ? ['insertion cleanup:0', 'insertion mount:1'] : ['insertion mount:1'],
			);
			expect(find(result.container, '#activity-insertion-before').style.display).toBe('none');
			result.update(ActivityInsertionAsyncHost, { ...props, mode: 'visible' });
			expect(log).toEqual(
				initial === 0 ? ['insertion cleanup:0', 'insertion mount:1'] : ['insertion mount:1'],
			);
			unmount(result);
			expect(log.at(-1)).toBe('insertion cleanup:1');
		},
	);

	// A completed child can supersede an aborted insertion effect without queuing
	// a replacement: its deps match the committed effect, or its slot-keyed hook
	// is omitted. A later memo bailout must not resurrect that abandoned body.
	it.each(['same-deps', 'omitted-slot'] as const)(
		'discards superseded insertion effects across hidden retries (%s)',
		async (variant) => {
			const first = deferred<string>();
			const second = deferred<string>();
			const log: string[] = [];
			const props = {
				value: 0,
				enabled: variant === 'same-deps',
				pending: false,
				promise: first.promise,
				log: (entry: string) => log.push(entry),
			};
			const result = render(ActivityInsertionRetryHost, props);
			expect(log).toEqual(variant === 'same-deps' ? ['insertion mount:0'] : []);
			log.length = 0;
			result.update(ActivityInsertionRetryHost, {
				...props,
				value: 1,
				enabled: true,
				pending: true,
			});
			expect(log).toEqual([]);
			result.update(ActivityInsertionRetryHost, {
				...props,
				pending: true,
				promise: second.promise,
			});
			expect(log).toEqual([]);
			await act(async () => {
				second.resolve('ready');
				await second.promise;
			});
			const before = find(result.container, '#activity-insertion-before');
			expect(before.textContent).toBe('0');
			expect(before.style.display).toBe('none');
			expect(log).toEqual([]);
			await act(async () => {
				first.resolve('superseded');
				await first.promise;
			});
			expect(log).toEqual([]);
			unmount(result);
			expect(log).toEqual(variant === 'same-deps' ? ['insertion cleanup:0'] : []);
		},
	);

	it.each([false, true])(
		'preserves repeated insertion effects through one custom-hook slot (pending %s)',
		async (pending) => {
			const request = deferred<string>();
			const log: string[] = [];
			const result = render(ActivityRepeatedInsertionHost, {
				pending,
				promise: request.promise,
				log: (entry: string) => log.push(entry),
			});
			if (pending) {
				expect(log).toEqual([]);
				await act(async () => {
					request.resolve('ready');
					await request.promise;
				});
			}
			expect(log).toEqual(['insertion shared mount:first', 'insertion shared mount:second']);
			expect(find(result.container, '#activity-insertion-repeated').style.display).toBe('none');
			unmount(result);
			expect(log).toEqual([
				'insertion shared mount:first',
				'insertion shared mount:second',
				'insertion shared cleanup:second',
			]);
		},
	);

	// Stable React 19.2.7 oracle: moving an aborted insertion update from an outer
	// Activity to a pending inner Activity does not commit it when the outer work
	// completes. A memo/context refresh must leave the inner retry responsible.
	it('transfers pending insertion effects to a nested Activity without committing early', async () => {
		const inner = deferred<string>();
		const outer = deferred<string>();
		const log: string[] = [];
		const props = {
			phase: 0,
			innerPromise: inner.promise,
			outerPromise: outer.promise,
			log: (entry: string) => log.push(entry),
		};
		const result = render(ActivityNestedInsertionRetryHost, props);
		expect(log).toEqual(['insertion mount:0']);
		log.length = 0;
		result.update(ActivityNestedInsertionRetryHost, { ...props, phase: 1 });
		expect(log).toEqual([]);
		result.update(ActivityNestedInsertionRetryHost, { ...props, phase: 2 });
		expect(log).toEqual([]);
		await act(async () => {
			inner.resolve('inner ready');
			await inner.promise;
		});
		expect(log).toEqual(['insertion cleanup:0', 'insertion mount:1']);
		expect(find(result.container, '#activity-insertion-before').style.display).toBe('none');
		await act(async () => {
			outer.resolve('superseded outer request');
			await outer.promise;
		});
		expect(log).toEqual(['insertion cleanup:0', 'insertion mount:1']);
		unmount(result);
		expect(log).toEqual(['insertion cleanup:0', 'insertion mount:1', 'insertion cleanup:1']);
	});
});
