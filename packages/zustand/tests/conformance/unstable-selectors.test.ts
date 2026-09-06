import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushEffects } from '../_helpers';
import { useObj, RawObject, ShallowObject } from '../_fixtures/shallow.tsrx';

beforeEach(() => {
	useObj.setState({ a: 0, b: 0 });
});

describe('selector snapshot stability', () => {
	it('rejects uncached snapshots and supports recovery with shallow selection', () => {
		// useSyncExternalStore requires the same reference until the selection
		// changes. A fresh object on every read cannot reach a stable commit.
		let mounted: ReturnType<typeof mount> | undefined;
		try {
			expect(() => {
				mounted = mount(RawObject, { onRender: () => {} });
				flushEffects();
			}).toThrow(/Maximum update depth exceeded/);
		} finally {
			mounted?.unmount();
		}

		const recovered = mount(ShallowObject, { onRender: () => {} });
		try {
			flushEffects();
			expect(recovered.find('#a').textContent).toBe('0');
			useObj.getState().bumpB();
			flushEffects();
			expect(recovered.find('#a').textContent).toBe('0');
			useObj.getState().bumpA();
			flushEffects();
			expect(recovered.find('#a').textContent).toBe('1');
		} finally {
			recovered.unmount();
		}
	});
});
