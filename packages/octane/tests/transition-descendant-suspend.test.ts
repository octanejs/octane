import { describe, it, expect } from 'vitest';
import { mount, act } from './_helpers';
import {
	TransitionDescendantSuspend,
	UrgentDescendantSuspend,
	UrgentParentWithTransitionChild,
	setValueTransition,
	setValueUrgent,
} from './_fixtures/transition-descendant-suspend.tsrx';
import { TransitionKeepsDom } from './_fixtures/transitions.tsrx';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (v: T) => void;
}
function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

// A thenable pre-tagged fulfilled resolves synchronously in use() (no suspend),
// so a value whose promise is already settled commits its content immediately.
function fulfilled<T>(value: T): PromiseLike<T> {
	return { then() {}, status: 'fulfilled', value } as any;
}

/**
 * Build a per-value promise registry. value=1 resolves synchronously (so the
 * initial commit has content). value=2 stays a controlled deferred so we can
 * drive the re-suspend → resolve transition deterministically.
 */
function makeRegistry() {
	const d2 = deferred<number>();
	const promises = new Map<number, PromiseLike<number>>();
	promises.set(1, fulfilled(1));
	promises.set(2, d2.promise);
	const promiseFor = (v: number) => promises.get(v)!;
	return { promiseFor, d2 };
}

describe('transition — DESCENDANT re-suspend keeps prior content (React useTransition parity)', () => {
	it.each([false, true])(
		'commits urgent parent props and layout while queued child content stays visible (reducer %s)',
		async (useReducer) => {
			const { promiseFor, d2 } = makeRegistry();
			let updateParent!: () => void;
			const layouts: number[] = [];
			const r = mount(UrgentParentWithTransitionChild, {
				promiseFor,
				useReducer,
				bindParent: (update: () => void) => {
					updateParent = update;
				},
				onLayout: (revision: number) => {
					layouts.push(revision);
				},
			});
			const content = r.find('#content');
			try {
				await act(() => {
					setValueTransition(2);
					updateParent();
				});
				expect(r.find('[data-revision]').getAttribute('data-revision')).toBe('1');
				expect(r.find('#content')).toBe(content);
				expect(content.getAttribute('data-parent')).toBe('1');
				expect(layouts.at(-1)).toBe(1);
				expect(r.find('#content').textContent).toBe('content-1');
				expect((r.find('#content') as HTMLElement).style.display).toBe('');
				expect(r.findAll('#fallback')).toHaveLength(0);
				expect(r.find('#content').getAttribute('data-pending')).toBe('pending');
				expect(r.find('#pending').textContent).toBe('idle');
				await act(() => d2.resolve(2));
				expect(r.find('#content').textContent).toBe('content-2');
				expect(r.find('#content').getAttribute('data-pending')).toBe('idle');
			} finally {
				r.unmount();
			}
		},
	);

	it('an urgent child error tears down a queued transition without reviving it on resolve', async () => {
		const { promiseFor, d2 } = makeRegistry();
		let updateParent!: () => void;
		const r = mount(UrgentParentWithTransitionChild, {
			promiseFor,
			failOnRevision: true,
			bindParent: (update: () => void) => {
				updateParent = update;
			},
			onLayout: () => {},
		});
		try {
			await act(() => {
				setValueTransition(2);
				updateParent();
			});
			expect(r.find('[role=alert]').textContent).toBe('urgent child error');
			expect(r.findAll('#content')).toHaveLength(0);
			expect(r.findAll('#fallback')).toHaveLength(0);
			await act(() => d2.resolve(2));
			expect(r.find('[role=alert]').textContent).toBe('urgent child error');
			expect(r.findAll('#content')).toHaveLength(0);
		} finally {
			r.unmount();
		}
	});

	it('holds content-1 while a transition re-suspends the child on value=2; unrelated hook stays idle; resolves to content-2', async () => {
		const { promiseFor, d2 } = makeRegistry();
		const r = mount(TransitionDescendantSuspend, { promiseFor });
		await act(() => {});

		// Initial commit: value=1 resolved synchronously, so the child's content
		// is shown and the boundary has committed/resolved content.
		expect(r.find('#content').textContent).toBe('content-1');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('idle');

		// Inside a transition, change value=2 → the CHILD re-renders on its OWN
		// (a descendant block) and re-suspends on d2 (still pending). The
		// descendant re-suspend must be HELD: content-1 stays in the DOM, NO
		// fallback flash. The sibling hook does not own this transition.
		await act(() => setValueTransition(2));
		expect(r.find('#content').textContent).toBe('content-1'); // OLD content held
		expect(r.find('#content').getAttribute('data-pending')).toBe('pending');
		expect(r.findAll('#fallback')).toHaveLength(0); // no fallback flash
		expect(r.find('#pending').textContent).toBe('idle');

		// Resolve d2 → the held try block resumes, the child re-renders with the
		// resolved value, content-2 commits, and isPending returns to idle.
		await act(() => {
			d2.resolve(2);
		});
		expect(r.find('#content').textContent).toBe('content-2');
		expect(r.find('#content').getAttribute('data-pending')).toBe('idle');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});

	it('an urgent ready update ends the descendant owner pending cue while its old request is unresolved', async () => {
		const { promiseFor: unresolvedFor, d2 } = makeRegistry();
		const ready = fulfilled(3);
		const promiseFor = (value: number) => (value === 3 ? ready : unresolvedFor(value));
		const r = mount(TransitionDescendantSuspend, { promiseFor });
		await act(() => setValueTransition(2));
		expect(r.find('#content').getAttribute('data-pending')).toBe('pending');
		expect(r.find('#pending').textContent).toBe('idle');
		await act(() => setValueUrgent(3));
		expect(r.find('#content').textContent).toBe('content-3');
		expect(r.find('#content').getAttribute('data-pending')).toBe('idle');
		expect(r.findAll('#fallback')).toHaveLength(0);
		await act(() => d2.resolve(2));
		expect(r.find('#content').textContent).toBe('content-3');
		expect(r.find('#content').getAttribute('data-pending')).toBe('idle');
		r.unmount();
	});
});

describe('transition — boundary OWN-body re-suspend still holds (unchanged)', () => {
	it('holds prior content when the try BODY itself re-suspends in a transition', async () => {
		// Guards the pre-existing own-body hold path against a regression from the
		// relaxed descendant hold. (Also covered in transitions.test.ts; kept here
		// so the descendant + own-body contracts live side by side.)
		const d1 = deferred<string>();
		const d2 = deferred<string>();
		d1.resolve('one');
		await Promise.resolve();
		const r = mount(TransitionKeepsDom, { initialPromise: d1.promise, nextPromise: d2.promise });
		await act(() => {});
		expect(r.find('#value').textContent).toBe('one');
		expect(r.find('#pending').textContent).toBe('idle');

		// The boundary's OWN body re-renders (setPromise lives on the boundary) and
		// re-suspends inside a transition → old value held, no fallback.
		r.click('#swap');
		expect(r.find('#value').textContent).toBe('one');
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#pending').textContent).toBe('pending');

		await act(() => {
			d2.resolve('two');
		});
		expect(r.find('#value').textContent).toBe('two');
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});
});

describe('NON-transition — DESCENDANT re-suspend still shows the @pending fallback (unchanged)', () => {
	it('an urgent value change that re-suspends the child swaps to the fallback', async () => {
		const { promiseFor, d2 } = makeRegistry();
		const r = mount(UrgentDescendantSuspend, { promiseFor });
		await act(() => {});
		const content = r.find('#content') as HTMLElement;
		expect(content.textContent).toBe('content-1');
		expect(r.findAll('#fallback')).toHaveLength(0);

		// Urgent (no transition) value change → descendant re-suspends → the
		// boundary hides the committed child in place and shows the @pending fallback.
		await act(() => setValueUrgent(2));
		expect(r.find('#content')).toBe(content);
		expect(content.isConnected).toBe(true);
		expect(content.style.display).toBe('none');
		expect(r.find('#fallback').textContent).toBe('fallback');

		// Resolve → the held child resumes with content-2 (state preserved).
		await act(() => {
			d2.resolve(2);
		});
		expect(r.findAll('#fallback')).toHaveLength(0);
		expect(r.find('#content')).toBe(content);
		expect(content.style.display).toBe('');
		expect(content.textContent).toBe('content-2');
		r.unmount();
	});
});
