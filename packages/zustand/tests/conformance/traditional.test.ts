/**
 * `@octane-ts/zustand/traditional` — createWithEqualityFn / useStoreWithEqualityFn.
 * The equality function bails out the selection (no re-render) when the selected
 * slice is "equal" by the provided comparator — here `shallow`. This exercises the
 * multi-base-hook wrapper (useRef + useMemo + useSyncExternalStore + useEffect)
 * driven by a single forwarded slot + derived sub-slots.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createWithEqualityFn, useStoreWithEqualityFn } from '@octane-ts/zustand/traditional';
import { shallow } from '@octane-ts/zustand/shallow';
import { mount, nextPaint } from '../_helpers';
import { useEq, EqDefault, EqPerCall } from '../_fixtures/traditional.tsrx';

beforeEach(() => {
	useEq.setState({ a: 0, b: 0, count: 0, other: 0 });
});

describe('createWithEqualityFn — default equality (shallow)', () => {
	it('does not re-render when the shallow-equal object slice is unchanged', async () => {
		let renders = 0;
		const r = mount(EqDefault, { onRender: () => renders++ });
		const afterMount = renders;
		expect(r.find('#a').textContent).toBe('0');

		useEq.getState().bumpB(); // unrelated → slice {a:0} shallow-equal → no render
		await nextPaint();
		expect(renders).toBe(afterMount);

		useEq.getState().bumpA(); // selected → slice changes → one render
		await nextPaint();
		expect(r.find('#a').textContent).toBe('1');
		expect(renders).toBe(afterMount + 1);
		r.unmount();
	});
});

describe('per-call equality function', () => {
	it('honors an equalityFn passed at the call site', async () => {
		let renders = 0;
		const r = mount(EqPerCall, { onRender: () => renders++ });
		const afterMount = renders;
		useEq.getState().bumpB();
		await nextPaint();
		expect(renders).toBe(afterMount); // bailed out via per-call shallow
		useEq.getState().bumpA();
		await nextPaint();
		expect(r.find('#a').textContent).toBe('1');
		r.unmount();
	});
});

describe('exports', () => {
	it('createWithEqualityFn returns a bound hook carrying the store api', () => {
		const useS = createWithEqualityFn(() => ({ n: 1 }), shallow);
		expect(typeof useS.getState).toBe('function');
		expect(typeof useS.setState).toBe('function');
		expect(typeof useS.subscribe).toBe('function');
		expect(useS.getState().n).toBe(1);
		// The standalone hook is exported too.
		expect(typeof useStoreWithEqualityFn).toBe('function');
	});
});
