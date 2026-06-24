import { describe, it, expect } from 'vitest';
import { mount, act, flushEffects, createLog } from '../_helpers';
import {
	UseEffectBoundary,
	UseLayoutEffectBoundary,
	HookOrderApp,
} from '../_fixtures/error-effects.tsrx';

describe('error-effects — effect throws caught by @catch', () => {
	// Per ReactErrorBoundaries-test.internal.js:2169 — 'catches errors in useEffect'.
	// An error thrown from a useEffect body propagates to the nearest boundary,
	// which swaps to the fallback showing "Caught an error: Hello.".
	it('catches an error thrown inside useEffect and shows the fallback', async () => {
		const log = createLog();
		const r = mount(UseEffectBoundary, { log: log.push });
		// Body rendered first; passive effect throw lands after paint.
		await act(async () => {});
		flushEffects();

		expect(log.drain()).toContain('BrokenUseEffect useEffect [!]');
		expect(r.findAll('.ok-wrap')).toHaveLength(0);
		expect(r.find('.caught').textContent).toBe('Caught an error: Hello.');
		r.unmount();
	});

	// Per ReactErrorBoundaries-test.internal.js:2198 — 'catches errors in
	// useLayoutEffect'. Layout-effect throws are routed to the same boundary;
	// these drain synchronously at commit so no paint wait is required.
	it('catches an error thrown inside useLayoutEffect and shows the fallback', async () => {
		const log = createLog();
		const r = mount(UseLayoutEffectBoundary, { log: log.push });
		await act(async () => {});
		flushEffects();

		expect(log.drain()).toContain('BrokenUseLayoutEffect useLayoutEffect [!]');
		expect(r.findAll('.ok-wrap')).toHaveLength(0);
		expect(r.find('.caught').textContent).toBe('Caught an error: Hello.');
		r.unmount();
	});
});

describe('error-effects — hook order preserved across catch', () => {
	// Per ReactErrorBoundariesHooks-test.internal.js:24 — 'should preserve hook
	// order if errors are caught'. After the boundary catches a render error from
	// a child that called a hook before throwing, re-rendering the App must not
	// throw and the stateful sibling keeps its hook state.
	it('catches the render throw and renders the sibling on first mount', () => {
		const r = mount(HookOrderApp);
		expect(r.find('.handled').textContent).toBe('Handled error: expected');
		expect(r.find('.stateful').textContent).toBe(' | stateful=0');
		r.unmount();
	});

	it('re-renders without throwing and keeps sibling hook state consistent', () => {
		const r = mount(HookOrderApp);
		expect(r.find('.handled').textContent).toBe('Handled error: expected');

		// Re-render the whole App (React: a second act(root.render(<App/>)) must
		// resolve without throwing — the caught subtree's hooks must not desync
		// the sibling's useState slot).
		expect(() => r.update(HookOrderApp)).not.toThrow();

		expect(r.find('.handled').textContent).toBe('Handled error: expected');
		expect(r.find('.stateful').textContent).toBe(' | stateful=0');
		r.unmount();
	});
});
