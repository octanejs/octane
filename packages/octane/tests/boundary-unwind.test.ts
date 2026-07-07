import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from './_helpers';
import {
	DeepThrowHost,
	RethrowingCatch,
	DeepSuspenseHost,
	StateFlipHost,
} from './_fixtures/boundary-unwind.tsrx';

// Error/suspense unwinding through nested passthrough components + host
// elements (the shape every router-style binding builds: boundary > passthrough
// > host > passthrough > leaf). Regression coverage for a teardown bug where
// the partial-mount cleanup threw jsdom's "The child can not be found in the
// parent" and REPLACED the original error (or escaped into the promise
// resolver's caller).
describe('boundary unwinding through nested components and hosts', () => {
	it('an error thrown under passthroughs + a host reaches the outer boundary intact', () => {
		const r = mount(DeepThrowHost, { bang: true });
		expect(r.container.textContent).toContain('outer:deep-boom');
		r.unmount();
	});

	it('renders normally when nothing throws', () => {
		const r = mount(DeepThrowHost, { bang: false });
		expect(r.find('.ok').textContent).toBe('ok');
		r.unmount();
	});

	it('a catch branch that rethrows forwards the ORIGINAL error to the outer boundary', () => {
		const r = mount(RethrowingCatch, { bang: true });
		expect(r.container.textContent).toContain('outer:deep-boom');
		r.unmount();
	});

	it('fallback → content swap under passthroughs + host does not corrupt teardown, and resolve() does not throw into the resolver', async () => {
		let resolveFn: (v: string) => void = () => {};
		const promise = new Promise<string>((res) => (resolveFn = res));
		const r = mount(DeepSuspenseHost, { promise });
		expect(r.container.textContent).toContain('loading');

		// Resolving must not let octane's retry/teardown throw back into us.
		expect(() => resolveFn('hi')).not.toThrow();
		await nextPaint();
		await new Promise((res) => setTimeout(res, 0));
		await nextPaint();

		expect(r.find('.v').textContent).toBe('v:hi');
		r.unmount();
	});

	// The router MatchInner shape: COMMITTED content re-renders into a suspension
	// (fallback shows, try DOM soft-detached), then a setState reaches the hidden
	// component directly (captured setter — the event-handler/timer shape) so a
	// retry no longer suspends. React parity: an update to a suspended component
	// retries the boundary — it must reveal the fresh subtree even though the
	// suspending promise NEVER resolves, and must not corrupt the detached DOM.
	it('setState inside a suspense-hidden subtree retries the boundary and reveals (resolve never called)', async () => {
		let setStatus: (v: string) => void = () => {};
		const promise = new Promise<string>(() => {});
		const r = mount(StateFlipHost, {
			bindSetter: (s: (v: string) => void) => (setStatus = s),
			promise,
		});
		// Committed content — the setter is captured.
		expect(r.findAll('.done').length).toBe(1);

		// Flip to pending: the re-render suspends on a never-resolving promise —
		// the fallback swaps in and the try content is soft-detached.
		expect(() => setStatus('pending')).not.toThrow();
		await nextPaint();
		await new Promise((res) => setTimeout(res, 0));
		await nextPaint();
		expect(r.container.textContent).toContain('loading');

		// Flip to a non-suspending value: the update targets a hidden block; the
		// boundary must retry and reveal — the promise never resolves.
		expect(() => setStatus('other')).not.toThrow();
		await nextPaint();
		await new Promise((res) => setTimeout(res, 0));
		await nextPaint();

		expect(r.findAll('.other').length).toBe(1);
		expect(r.container.textContent).not.toContain('loading');
		r.unmount();
	});
});
