import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from './_helpers';
import { SuspenseHost, SuspenseHostJsx, ErrorHost } from './_fixtures/boundary.tsrx';

describe('<Suspense> component', () => {
	it('shows fallback while pending, then the content when resolved', async () => {
		let resolveFn: (v: string) => void = () => {};
		const promise = new Promise<string>((r) => (resolveFn = r));
		const r = mount(SuspenseHost, { promise });
		expect(r.container.textContent).toContain('loading');
		resolveFn('hi');
		await nextPaint();
		expect(r.find('#v').textContent).toBe('v:hi');
		r.unmount();
	});

	it('supports inline JSX as the fallback', async () => {
		let resolveFn: (v: string) => void = () => {};
		const promise = new Promise<string>((r) => (resolveFn = r));
		const r = mount(SuspenseHostJsx, { promise });
		expect(r.find('#fb').textContent).toBe('spinner');
		resolveFn('hi');
		await nextPaint();
		expect(r.find('#v').textContent).toBe('v:hi');
		r.unmount();
	});
});

describe('<ErrorBoundary> component', () => {
	it('renders children when no error', () => {
		const r = mount(ErrorHost, { bang: false });
		expect(r.find('#ok').textContent).toBe('ok');
		r.unmount();
	});
	it('catches a thrown error and renders the fallback render-prop', () => {
		const r = mount(ErrorHost, { bang: true });
		expect(r.container.textContent).toContain('caught:boom');
		r.unmount();
	});
});
