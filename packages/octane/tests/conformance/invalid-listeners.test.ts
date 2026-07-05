/**
 * Conformance port of react-dom/src/__tests__/InvalidEventListeners-test.js
 * (React v19.2.7) — a non-function or null event listener must not break
 * dispatch. Per plan §2 the DEV warning text is not ported (octane's warning
 * policy differs); only the functional outcome is: the dispatch does not crash
 * the app and does not block other handlers on the propagation path.
 */
import { describe, it, expect } from 'vitest';
import { mount, createLog } from '../_helpers';
import { BadListenerTree } from './_fixtures/invalid-listeners.tsrx';

describe('InvalidEventListeners', () => {
	// Per InvalidEventListeners-test.js:36 — should prevent non-function
	// listeners, at dispatch. React surfaces a controlled error for the bad
	// listener but the dispatch itself survives (each listener invocation is
	// guarded), so ancestor handlers on the path still run.
	//
	// GAP: octane's `fireEventSlot` (runtime.ts:4226) treats any truthy
	// non-function slot as a `{ fn, args }` handler bundle — a string listener
	// throws `TypeError: Cannot read properties of undefined (reading 'length')`
	// on `slot.args`, which propagates out of the `dispatchDelegated` walk
	// (runtime.ts:4259) and aborts it: the ancestor's onClick never fires. Fix
	// would validate the slot shape (skip or report non-callable slots) and
	// continue the walk.
	it('a non-function listener does not block ancestor handlers at dispatch', () => {
		const log = createLog();
		const onErr = (e: ErrorEvent) => e.preventDefault(); // swallow the expected dispatch error
		window.addEventListener('error', onErr);
		const r = mount(BadListenerTree, { onAnc: () => log.push('anc'), bad: 'not a function' });
		try {
			r.find('.target').dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(log.drain()).toEqual(['anc']);
		} finally {
			window.removeEventListener('error', onErr);
			r.unmount();
		}
	});

	// Per InvalidEventListeners-test.js:84 — should not prevent null listeners,
	// at dispatch. A null listener is simply skipped: no crash, no error, and the
	// rest of the propagation path still runs.
	it('a null listener is skipped at dispatch without crashing or blocking', () => {
		const log = createLog();
		const errors: string[] = [];
		const onErr = (e: ErrorEvent) => {
			errors.push(String(e.message));
			e.preventDefault();
		};
		window.addEventListener('error', onErr);
		const r = mount(BadListenerTree, { onAnc: () => log.push('anc'), bad: null });
		try {
			r.find('.target').dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(log.drain()).toEqual(['anc']);
			expect(errors).toEqual([]);
		} finally {
			window.removeEventListener('error', onErr);
			r.unmount();
		}
	});
});
