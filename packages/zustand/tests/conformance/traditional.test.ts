/**
 * `@octanejs/zustand/traditional` — createWithEqualityFn / useStoreWithEqualityFn.
 * The equality function bails out the selection (no re-render) when the selected
 * slice is "equal" by the provided comparator — here `shallow`. This exercises the
 * multi-base-hook wrapper (useRef + useMemo + useSyncExternalStore + useEffect)
 * driven by a single forwarded slot + derived sub-slots.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createWithEqualityFn, useStoreWithEqualityFn } from '@octanejs/zustand/traditional';
import { createStore } from '@octanejs/zustand/vanilla';
import { shallow } from '@octanejs/zustand/shallow';
import { mount, nextPaint } from '../_helpers';
import { useEq, EqDefault, EqPerCall } from '../_fixtures/traditional.tsrx';
import {
	SelectionReader,
	TraditionalErrors,
	equalSelection,
	keepSelection,
	selectFirst,
	selectSecond,
	type SelectionState,
} from '../_fixtures/traditional-contracts.tsrx';

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

describe('traditional selection updates', () => {
	it('keeps an unchanged selection current across parent renders and later writes', async () => {
		const api = createStore<SelectionState>(() => ({ first: 1, second: 10 }));
		const props = { api, selector: selectFirst, equalityFn: equalSelection, generation: 0 };
		const r = mount(SelectionReader, props);
		try {
			await nextPaint();
			r.update(SelectionReader, { ...props, generation: 1 });
			expect(r.find('#selection').getAttribute('data-generation')).toBe('1');
			expect(r.find('#selection').textContent).toBe('1');

			api.setState({ second: 11 });
			await nextPaint();
			expect(r.find('#selection').textContent).toBe('1');
			api.setState({ first: 2 });
			await nextPaint();
			expect(r.find('#selection').textContent).toBe('2');
		} finally {
			r.unmount();
		}
	});

	// Per zustand@5.0.14 tests/basic.test.tsx, "can update the selector".
	it('uses a changed selector before the store changes again', async () => {
		const api = createStore<SelectionState>(() => ({ first: 1, second: 10 }));
		const props = { api, selector: selectFirst, equalityFn: equalSelection };
		const r = mount(SelectionReader, props);
		try {
			await nextPaint();
			r.update(SelectionReader, { ...props, selector: selectSecond });
			expect(r.find('#selection').textContent).toBe('10');
			api.setState({ first: 2 });
			await nextPaint();
			expect(r.find('#selection').textContent).toBe('10');
			api.setState({ second: 11 });
			await nextPaint();
			expect(r.find('#selection').textContent).toBe('11');
		} finally {
			r.unmount();
		}
	});

	// Per zustand@5.0.14 tests/basic.test.tsx, "can update the equality checker".
	it('applies a changed equality function to the current store snapshot', async () => {
		const api = createStore<SelectionState>(() => ({ first: 1, second: 10 }));
		const props = { api, selector: selectFirst, equalityFn: keepSelection };
		const r = mount(SelectionReader, props);
		try {
			await nextPaint();
			api.setState({ first: 2 });
			await nextPaint();
			expect(r.find('#selection').textContent).toBe('1');

			r.update(SelectionReader, { ...props, equalityFn: equalSelection });
			expect(r.find('#selection').textContent).toBe('2');
			api.setState({ first: 3 });
			await nextPaint();
			expect(r.find('#selection').textContent).toBe('3');
		} finally {
			r.unmount();
		}
	});

	it('moves the subscription when two stores initially share a snapshot', async () => {
		const initial = { first: 1, second: 10 };
		const first = createStore<SelectionState>(() => initial);
		const second = createStore<SelectionState>(() => initial);
		const props = { api: first, selector: selectFirst, equalityFn: equalSelection };
		const r = mount(SelectionReader, props);
		try {
			await nextPaint();
			r.update(SelectionReader, { ...props, api: second });
			await nextPaint();
			first.setState({ first: 5 });
			await nextPaint();
			expect(r.find('#selection').textContent).toBe('1');
			second.setState({ first: 7 });
			await nextPaint();
			expect(r.find('#selection').textContent).toBe('7');
		} finally {
			r.unmount();
		}
	});

	for (const kind of ['selector', 'equality'] as const) {
		// Per zustand@5.0.14 tests/basic.test.tsx, selector/equality error cases.
		it(`routes ${kind} errors to the boundary and can recover`, async () => {
			const r = mount(TraditionalErrors, { kind });
			try {
				await nextPaint();
				expect(r.find('#error-value').textContent).toBe(kind === 'selector' ? 'READY' : 'ready');
				r.click('#break-selection');
				await nextPaint();
				expect(r.find('#selection-error').textContent).toContain(`${kind} requires text`);
				r.click('#repair-selection');
				r.click('#retry-selection');
				await nextPaint();
				expect(r.find('#error-value').textContent).toBe(
					kind === 'selector' ? 'RECOVERED' : 'recovered',
				);
			} finally {
				r.unmount();
			}
		});
	}
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
