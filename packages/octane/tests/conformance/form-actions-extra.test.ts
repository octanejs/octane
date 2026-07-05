import { describe, it, expect, vi } from 'vitest';
import { mount, flushEffects } from '../_helpers';
import { flushSync } from '../../src/index.js';
import {
	ExposedActionState,
	BoundaryActionState,
	ManualTransitionForm,
	PlainSubmitForm,
	NoPreventDefaultForm,
	InterceptedForm,
} from './_fixtures/form-actions-extra.tsrx';

// Conformance deepening of ReactDOMForm-test.js on top of tests/actions.test.ts
// and tests/form-reset.test.ts:
//   * useActionState dispatch queue — strict sequencing (a queued action does not
//     START until the previous one finishes) and error handling (@try/@catch is
//     octane's error boundary; an errored action does NOT cancel the queue —
//     octane divergence, pinned in actions.test.ts for sync throws).
//   * the useFormStatus ACTIVATION rule — in octane, pending is published ONLY by
//     the intercepted `<form action={fn}>` submit path (handleFormSubmit in
//     runtime.ts); React additionally activates it for a startTransition inside a
//     preventDefault-ed onSubmit.
//
// Covered by existing suites (not re-ported):
//   * basic dispatch/pending/state commit + sequential threading —
//     tests/actions.test.ts (Per ReactDOMForm-test.js:980 basics).
//   * uncontrolled inputs reset after a raw form action completes (Per :1510) —
//     tests/actions.test.ts "raw <form action={fn}> auto-reset".
//   * requestFormReset scheduling/warning (Per :1588/:1917) — tests/form-reset.test.ts.
//   * pending persists until ALL queued submits drain — tests/actions.test.ts.
//   * sync-throw keeps the queue threading (Per :1314 divergence, sync half) —
//     tests/actions.test.ts "keeps the dispatch queue threading".
//
// Out of scope per docs/react-parity-migration-plan.md §2:
//   * StrictMode variant (:1373) — no StrictMode in octane.
//   * Suspense-loading-state entanglement variants (:1419/:1471 warning halves).
//   * form.submit() manual-submit error (:934) — React-specific guardrail on its
//     synthetic dispatch; octane uses native submit events.

function deferred<T = void>() {
	let resolve!: (v: T) => void;
	let reject!: (e: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function settle() {
	for (let i = 0; i < 30; i++) await Promise.resolve();
	flushSync(() => {});
	flushEffects();
}

function submit(container: HTMLElement) {
	const form = container.querySelector('form') as HTMLFormElement;
	flushSync(() => {
		form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
	});
	return form;
}

describe('conformance: useActionState queue sequencing (ReactDOMForm)', () => {
	// Per ReactDOMForm-test.js:1085 — queues multiple actions and runs them in
	// order. Per :980 — "None of these will start until the previous one
	// finishes": even with LATER deferreds already resolved, a queued action must
	// not start early.
	it('queues multiple actions and runs them in order, never starting early (Per :1085/:980)', async () => {
		const started: string[] = [];
		const gates: Record<string, ReturnType<typeof deferred>> = {
			B: deferred(),
			C: deferred(),
			D: deferred(),
		};
		let dispatch!: (payload: string) => void;
		const action = async (_prev: string, payload: string) => {
			started.push(payload);
			await gates[payload].promise;
			return payload;
		};
		const r = mount(ExposedActionState as any, {
			action,
			initial: 'A',
			expose: (d: any) => (dispatch = d),
		});
		flushSync(() => {});
		expect(r.find('#state').textContent).toBe('A');

		flushSync(() => dispatch('B'));
		flushSync(() => dispatch('C'));
		flushSync(() => dispatch('D'));
		expect(r.find('#pending').textContent).toBe('pending');

		// Resolve C and D FIRST. B still gates the queue: C must not have started.
		gates.C.resolve();
		gates.D.resolve();
		await settle();
		expect(started).toEqual(['B']);
		expect(r.find('#pending').textContent).toBe('pending');
		expect(r.find('#state').textContent).toBe('A'); // nothing committed yet

		// Unblock B → C and D run, in order.
		gates.B.resolve();
		await settle();
		expect(started).toEqual(['B', 'C', 'D']);
		expect(r.find('#state').textContent).toBe('D');
		expect(r.find('#pending').textContent).toBe('idle');
		r.unmount();
	});
});

describe('conformance: useActionState error handling (ReactDOMForm)', () => {
	// Per ReactDOMForm-test.js:1220 — error handling (sync action): the throw
	// surfaces at the error boundary (octane: @try/@catch).
	it('routes a synchronously-throwing action to the error boundary (Per :1220)', async () => {
		let dispatch!: (payload: string) => void;
		const action = (_prev: string, payload: string) => {
			if (payload.endsWith('!')) throw new Error(payload);
			return payload;
		};
		const r = mount(BoundaryActionState as any, {
			action,
			initial: 'A',
			expose: (d: any) => (dispatch = d),
		});
		flushSync(() => {});
		expect(r.find('#state').textContent).toBe('A');

		flushSync(() => dispatch('Oops!'));
		await settle();
		expect(r.find('#err').textContent).toBe('Caught an error: Oops!');
		expect(r.container.querySelector('#state')).toBe(null); // boundary swapped
		r.unmount();
	});

	// Per :1268 — error handling (async action).
	it('routes an async action rejection to the error boundary (Per :1268)', async () => {
		const gate = deferred();
		let dispatch!: (payload: string) => void;
		const action = async (_prev: string, payload: string) => {
			await gate.promise;
			throw new Error(payload);
		};
		const r = mount(BoundaryActionState as any, {
			action,
			initial: 'A',
			expose: (d: any) => (dispatch = d),
		});
		flushSync(() => {});

		flushSync(() => dispatch('Oops!'));
		await settle();
		expect(r.find('#pending').textContent).toBe('pending'); // still in flight

		gate.resolve();
		await settle();
		expect(r.find('#err').textContent).toBe('Caught an error: Oops!');
		r.unmount();
	});

	// Per :1314 — React CANCELS all queued (and future) dispatches once an action
	// errors (the error unwinds into the boundary and the queue is dead).
	// OCTANE DIVERGENCE: an errored action resolves its queue slot with the PRIOR
	// state and the chain keeps threading — queued and later dispatches still run
	// (the sync-throw half of this rule is pinned in tests/actions.test.ts
	// "keeps the dispatch queue threading after a synchronous throw"). This test
	// pins the async half of octane's keep-the-queue-alive behavior.
	it('keeps running queued actions after an async error (octane divergence, Per :1314)', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const gate = deferred();
		const ran: string[] = [];
		let dispatch!: (payload: string) => void;
		const action = async (prev: string, payload: string) => {
			ran.push(payload);
			if (payload === 'fail') {
				await gate.promise;
				throw new Error('Oops!');
			}
			return prev + '/' + payload;
		};
		const r = mount(ExposedActionState as any, {
			action,
			initial: 'A',
			expose: (d: any) => (dispatch = d),
		});
		flushSync(() => {});

		flushSync(() => dispatch('fail'));
		flushSync(() => dispatch('next')); // queued behind the failing action
		gate.resolve();
		await settle();
		// React: ran === ['fail'] and 'next' never runs. Octane: the queue
		// survives; 'next' threads the PRIOR state ('A', the failed action's
		// result was discarded).
		expect(ran).toEqual(['fail', 'next']);
		expect(r.find('#state').textContent).toBe('A/next');
		expect(r.find('#pending').textContent).toBe('idle');
		expect(spy).toHaveBeenCalled(); // the error was reported, not swallowed
		spy.mockRestore();
		r.unmount();
	});
});

describe('conformance: useFormStatus activation rule (ReactDOMForm)', () => {
	// GAP: Per ReactDOMForm-test.js:2021/:2078 — React ACTIVATES useFormStatus
	// when startTransition is called inside a preventDefault-ed submit event
	// (the manual-action idiom). In octane, form status is published ONLY by the
	// intercepted `<form action={fn}>` path (handleFormSubmit → setFormStatus in
	// runtime.ts); a transition started during a submit event dispatch never
	// reaches the form. Likely fix: handleFormSubmit-adjacent tracking — when a
	// transition starts synchronously during a form's submit dispatch whose
	// default was prevented, publish pending status to that form until it settles.
	it.fails(
		'activates for startTransition inside a preventDefault-ed submit (Per :2021/:2078)',
		async () => {
			const gate = deferred();
			const r = mount(ManualTransitionForm as any, {
				value: 'Initial',
				wait: () => gate.promise,
			});
			try {
				flushSync(() => {});
				expect(r.find('#out').textContent).toBe('Initial');

				submit(r.container);
				await Promise.resolve();
				await Promise.resolve();
				flushSync(() => {});
				// React: the form switches into a pending state.
				expect(r.find('#out').textContent).toBe('Initial (pending...)');

				gate.resolve();
				await settle();
				expect(r.find('#out').textContent).toBe('Initial');
			} finally {
				// This test is expected to fail mid-flight (see the GAP note) — the
				// in-flight transition and mounted form MUST still be drained, or the
				// leaked async-transition window corrupts the tests that follow.
				gate.resolve();
				await settle();
				r.unmount();
			}
		},
	);

	// Per :2089/:2146 — a plain async event handler (no transition) never
	// activates useFormStatus. Octane matches.
	it('is not activated if startTransition is not called (Per :2089/:2146)', async () => {
		const gate = deferred();
		let handled = false;
		const r = mount(PlainSubmitForm as any, {
			value: 'Initial',
			onSubmit: async () => {
				handled = true;
				await gate.promise;
			},
		});
		flushSync(() => {});

		submit(r.container);
		expect(handled).toBe(true);
		await settle();
		expect(r.find('#out').textContent).toBe('Initial'); // never pending

		gate.resolve();
		await settle();
		expect(r.find('#out').textContent).toBe('Initial');
		r.unmount();
	});

	// Per :2160/:2206 — without preventDefault the default submission proceeds
	// (navigation in a browser) and useFormStatus is not activated. jsdom has no
	// navigation for a dispatched submit event; the observable half is that the
	// status never flips.
	it('is not activated if the event is not preventDefault-ed (Per :2160)', async () => {
		const gate = deferred();
		const r = mount(NoPreventDefaultForm as any, { value: 'Initial', wait: () => gate.promise });
		flushSync(() => {});

		submit(r.container);
		await settle();
		expect(r.find('#out').textContent).toBe('Initial'); // never pending
		gate.resolve();
		await settle();
		r.unmount();
	});

	// Per :2215 (partial port) — the status object's fields during a pending
	// intercepted submit: `action` passes the FUNCTION through, `data` carries
	// the form's fields, `method` is post. The string/symbol/toString coercion
	// halves of React's test depend on activation via startTransition with a
	// non-function `action` prop — not reachable in octane, where only function
	// actions intercept submits (documented above).
	it('reports pending {action, data, method} for the intercepted path (Per :2215 — function half)', async () => {
		const gate = deferred();
		let status: any = null;
		const action = (_fd: FormData) => gate.promise;
		const r = mount(InterceptedForm as any, { action, expose: (s: any) => (status = s) });
		flushSync(() => {});
		expect(r.find('#sf').textContent).toBe('idle');

		submit(r.container);
		expect(r.find('#sf').textContent).toBe('pending');
		expect(status).not.toBe(null);
		expect(status.pending).toBe(true);
		expect(status.method).toBe('post');
		expect(typeof status.action).toBe('function');
		expect(status.data).toBeInstanceOf(FormData);
		expect(status.data.get('q')).toBe('init');

		gate.resolve();
		await settle();
		expect(r.find('#sf').textContent).toBe('idle');
		r.unmount();
	});
});
