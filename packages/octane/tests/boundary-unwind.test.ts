import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from './_helpers';
import {
	DeepThrowHost,
	RethrowingCatch,
	DeepSuspenseHost,
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
});
