import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { SameFlushUnmount } from './_fixtures/ref-dispose.tsrx';

describe('deferred ref attach — same-flush unmount', () => {
	it('a ref queued then unmounted in the same flush is not re-attached to the torn-down node', () => {
		const refObj: { current: any } = { current: 'sentinel' };
		const r = mount(SameFlushUnmount, { refObj });

		// The try body threw during mount; the catch branch rendered.
		expect(r.find('#caught').textContent).toBe('caught');
		// React contract (ReactErrorBoundaries:1158, conformance/refs-under-error):
		// a ref belonging to work that never COMMITTED is never invoked at all —
		// the deferred attach is skipped (disposed subtree) AND the teardown detach
		// is suppressed (unmountScope's `mounted !== true` guard), so the ref keeps
		// its prior value. The original regression this test pinned (the drain
		// re-running attachRef and resurrecting the torn-down node) stays covered:
		// current must NOT be the dead element.
		expect(refObj.current).toBe('sentinel');

		r.unmount();
	});
});
