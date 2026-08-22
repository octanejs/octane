import { describe, it, expect, vi } from 'vitest';
import { flushSync } from 'octane';
import { act, flushEffects, mount, nextPaint } from './_helpers';
import {
	SuspenseHost,
	SuspenseHostJsx,
	ErrorHost,
	SuspendingErrorFallbackHost,
	ResetErrorHost,
	RetainedResetErrorHost,
	RetainedResetSuspenseHost,
	EffectErrorHost,
	LifecycleErrorHost,
	RefDetachErrorHost,
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

	it.each(['raw resource', 'use'] as const)(
		'lets an imported ErrorBoundary error fallback suspend through outer Suspense (%s)',
		async (readMode) => {
			let resolved = false;
			let resolve!: (value: string) => void;
			const promise = new Promise<string>((done) => {
				resolve = done;
			});
			const read = () => {
				if (!resolved) throw promise;
				return 'error fallback ready';
			};
			const log: string[] = [];
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
			const r = mount(SuspendingErrorFallbackHost, {
				promise,
				read,
				usePromise: readMode === 'use',
				log,
			});
			try {
				expect(r.find('#outer-error-pending').textContent).toBe('outer loading');
				expect(r.container.querySelector('#suspended-error-fallback')).toBeNull();
				expect(log).toEqual([]);
				expect(consoleError).not.toHaveBeenCalled();

				await act(async () => {
					resolved = true;
					resolve('error fallback ready');
					await promise;
				});
				expect(r.container.querySelector('#outer-error-pending')).toBeNull();
				expect(r.find('#suspended-error-fallback').textContent).toBe('error fallback ready');
				expect(log).toEqual(['mount']);
				expect(consoleError).not.toHaveBeenCalled();
			} finally {
				r.unmount();
				consoleError.mockRestore();
			}
			expect(log).toEqual(['mount', 'unmount']);
			expect(r.container.childNodes).toHaveLength(0);
		},
	);

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

	it.each(['layout', 'passive'] as const)(
		'catches a descendant %s effect without retaining its failed content',
		async (phase) => {
			const r = mount(EffectErrorHost, { phase });
			await act(async () => {});
			flushEffects();
			expect(r.find('#effect-error').textContent).toBe(`${phase} failed`);
			expect(r.findAll('#effect-before-error')).toHaveLength(0);
			r.unmount();
		},
	);

	it('detaches a failed primary ref and runs its committed cleanup exactly once', () => {
		const log: string[] = [];
		const refs: Array<Element | null> = [];
		const hostRef = (node: Element | null) => {
			refs.push(node);
		};
		const r = mount(LifecycleErrorHost, { fail: false, log, hostRef });
		const primary = r.find('#boundary-primary');
		expect(refs).toEqual([primary]);
		expect(log).toEqual(['setup']);

		r.update(LifecycleErrorHost, { fail: true, log, hostRef });
		expect(r.find('#lifecycle-error').textContent).toBe('lifecycle failed');
		expect(r.findAll('#boundary-primary')).toHaveLength(0);
		expect(refs).toEqual([primary, null]);
		expect(log).toEqual(['setup', 'cleanup']);
		r.unmount();
		expect(log).toEqual(['setup', 'cleanup']);
	});

	it('stops committing fallback when primary cleanup unmounts its root', () => {
		const log: string[] = [];
		let mounted!: ReturnType<typeof mount>;
		const onCleanup = () => mounted.unmount();
		mounted = mount(LifecycleErrorHost, { fail: false, log, onCleanup });
		expect(() => mounted.update(LifecycleErrorHost, { fail: true, log, onCleanup })).not.toThrow();
		expect(mounted.container.childNodes).toHaveLength(0);
		expect(log).toEqual(['setup', 'cleanup']);
	});

	it('catches a descendant ref-detach failure without leaving its previous subtree mounted', () => {
		const calls: Array<Element | null> = [];
		const hostRef = (node: Element | null) => {
			calls.push(node);
			if (node === null) throw new Error('ref detach failed');
		};
		const r = mount(RefDetachErrorHost, { keep: true, hostRef });
		const primary = r.find('#boundary-ref');
		expect(() => r.update(RefDetachErrorHost, { keep: false, hostRef })).not.toThrow();
		expect(r.find('#ref-error').textContent).toBe('ref detach failed');
		expect(r.findAll('#boundary-ref-sibling')).toHaveLength(0);
		expect(calls).toEqual([primary, null]);
		r.unmount();
	});
});
