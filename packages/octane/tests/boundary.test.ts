import { describe, it, expect } from 'vitest';
import { flushSync } from 'octane';
import { mount, nextPaint } from './_helpers';
import {
	SuspenseHost,
	SuspenseHostJsx,
	ErrorHost,
	ResetErrorHost,
	RetainedResetErrorHost,
	RetainedResetSuspenseHost,
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

	it('exposes a stable reset dispatcher before a descendant fails', () => {
		const state = { failed: false };
		const resetRef: { current: (() => void) | null } = { current: null };
		const r = mount(RetainedResetErrorHost, { state, resetRef });
		const retainedReset = resetRef.current;
		expect(retainedReset).toBeTypeOf('function');
		const healthyNode = r.find('#reset-ok');
		flushSync(() => retainedReset!());
		expect(r.find('#reset-ok')).toBe(healthyNode);
		const replacementRef: { current: (() => void) | null } = { current: null };
		r.update(RetainedResetErrorHost, { state, resetRef: replacementRef });
		expect(resetRef.current).toBeNull();
		expect(replacementRef.current).toBe(retainedReset);
		r.update(RetainedResetErrorHost, { state, resetRef: undefined });
		expect(replacementRef.current).toBeNull();
		r.update(RetainedResetErrorHost, { state, resetRef: replacementRef });
		state.failed = true;
		r.update(RetainedResetErrorHost, { state, resetRef: replacementRef });
		expect(r.find('#retained-reset-error').textContent).toBe('caught:Error: reset me');
		state.failed = false;
		flushSync(() => retainedReset!());
		expect(r.find('#reset-ok').textContent).toBe('recovered');
		expect(replacementRef.current).toBe(retainedReset);
		r.unmount();
		expect(() => retainedReset!()).not.toThrow();
	});

	it('does not reset a boundary while its child is suspended', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => (resolve = done));
		const resetRef: { current: (() => void) | null } = { current: null };
		const r = mount(RetainedResetSuspenseHost, { promise, resetRef });
		const pending = r.find('#retained-pending');
		flushSync(() => resetRef.current!());
		expect(r.find('#retained-pending')).toBe(pending);
		resolve('ready');
		await nextPaint();
		expect(r.find('#v').textContent).toBe('v:ready');
		r.unmount();
	});
});
