import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from './_helpers';
import {
	SuspenseHost,
	SuspenseHostJsx,
	ErrorHost,
	ResetErrorHost,
} from './_fixtures/boundary.tsrx';

describe('<Suspense> component', () => {
	it('shows an outer fallback when a nested ErrorBoundary child suspends', async () => {
		let resolveFn: (v: string) => void = () => {};
		const promise = new Promise<string>((r) => (resolveFn = r));
		const r = mount(SuspenseHost, { promise });
		expect(r.find('#ready').textContent).toBe('ready');
		(r.find('#suspend') as HTMLButtonElement).click();
		expect(r.container.textContent).toContain('loading');
		expect(r.container.textContent).not.toContain('caught');
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
		expect(r.container.textContent).not.toContain('caught');
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
	it('passes reset to an inline compiled fallback', () => {
		const state = { failed: true };
		const r = mount(ResetErrorHost, { state });
		expect(r.find('#reset-error').textContent).toBe('retry:reset me');
		r.click('#reset-error');
		expect(r.find('#reset-ok').textContent).toBe('recovered');
		r.unmount();
	});
});
