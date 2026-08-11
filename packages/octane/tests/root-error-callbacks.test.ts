// React 19 root option parity: createRoot/hydrateRoot accept onCaughtError and
// onUncaughtError (reporting callbacks; Octane passes only the error — there is
// no errorInfo/componentStack channel). Providing a callback changes REPORTING
// only:
//   - onCaughtError fires after a boundary (@try/@catch, <ErrorBoundary>)
//     claims an error from the render, passive-effect, or ref-attach channel.
//   - onUncaughtError replaces the default report for an error no boundary
//     claims (the flush rethrow for render errors, console.error for effect
//     channels). Recovery semantics are unchanged: an uncaught render error
//     still unmounts the failed root's tree.
// Roots created WITHOUT the options keep today's behavior byte-for-byte; the
// control tests below pin that.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createRoot, flushSync } from '../src/index.js';
import {
	CaughtHost,
	UncaughtHost,
	CaughtEffectHost,
	UncaughtEffectHost,
	triggerRenderThrow,
	triggerEffectThrow,
} from './_fixtures/root-error-callbacks.tsrx';

describe('root error callbacks — onCaughtError / onUncaughtError', () => {
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		container.remove();
		errSpy.mockRestore();
	});

	it('onCaughtError fires once when a boundary claims a render error', async () => {
		const onCaughtError = vi.fn();
		const root = createRoot(container, { onCaughtError });
		await act(() => root.render(CaughtHost, {}));
		expect(container.textContent).toBe('ok');
		await act(() => triggerRenderThrow());
		expect(container.textContent).toBe('caught:render-boom');
		expect(onCaughtError).toHaveBeenCalledTimes(1);
		expect((onCaughtError.mock.calls[0][0] as Error).message).toBe('render-boom');
		root.unmount();
	});

	it('onCaughtError fires when a boundary claims a passive-effect error', async () => {
		const onCaughtError = vi.fn();
		const root = createRoot(container, { onCaughtError });
		await act(() => root.render(CaughtEffectHost, {}));
		expect(container.textContent).toBe('eok');
		await act(() => triggerEffectThrow());
		expect(container.textContent).toBe('effect-caught');
		expect(onCaughtError).toHaveBeenCalledTimes(1);
		expect((onCaughtError.mock.calls[0][0] as Error).message).toBe('effect-boom');
		root.unmount();
	});

	it('onCaughtError does NOT fire for an uncaught error', async () => {
		const onCaughtError = vi.fn();
		const root = createRoot(container, { onCaughtError });
		await act(() => root.render(UncaughtHost, {}));
		expect(() => flushSync(() => triggerRenderThrow())).toThrow('render-boom');
		expect(onCaughtError).not.toHaveBeenCalled();
	});

	it('onUncaughtError consumes an unclaimed render error; the tree still unmounts', async () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		await act(() => root.render(UncaughtHost, {}));
		expect(container.textContent).toBe('ok');
		expect(() => flushSync(() => triggerRenderThrow())).not.toThrow();
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('render-boom');
		// React 19 contract retained: known-broken UI never stays on screen.
		expect(container.textContent).toBe('');
	});

	it('onUncaughtError does NOT fire for a boundary-claimed error', async () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		await act(() => root.render(CaughtHost, {}));
		await act(() => triggerRenderThrow());
		expect(container.textContent).toBe('caught:render-boom');
		expect(onUncaughtError).not.toHaveBeenCalled();
		root.unmount();
	});

	it('onUncaughtError replaces console.error for an unclaimed passive-effect error', async () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		await act(() => root.render(UncaughtEffectHost, {}));
		errSpy.mockClear();
		await act(() => triggerEffectThrow());
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('effect-boom');
		expect(errSpy).not.toHaveBeenCalled();
		root.unmount();
	});

	it('a throwing callback is reported and does not corrupt recovery', async () => {
		const onUncaughtError = vi.fn(() => {
			throw new Error('handler-boom');
		});
		const root = createRoot(container, { onUncaughtError });
		await act(() => root.render(UncaughtHost, {}));
		expect(() => flushSync(() => triggerRenderThrow())).not.toThrow();
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		// The callback's own throw is reported through console.error, not rethrown.
		expect(errSpy).toHaveBeenCalled();
		expect(container.textContent).toBe('');
	});

	// ── Controls: roots WITHOUT the options keep the existing contract ──────────

	it('control: without onUncaughtError the flush rethrows and the tree unmounts', async () => {
		const root = createRoot(container);
		await act(() => root.render(UncaughtHost, {}));
		expect(() => flushSync(() => triggerRenderThrow())).toThrow('render-boom');
		expect(container.textContent).toBe('');
	});

	it('control: without onUncaughtError an unclaimed effect error console.errors', async () => {
		const root = createRoot(container);
		await act(() => root.render(UncaughtEffectHost, {}));
		errSpy.mockClear();
		await act(() => triggerEffectThrow());
		expect(errSpy).toHaveBeenCalled();
		expect((errSpy.mock.calls[0][0] as Error).message).toBe('effect-boom');
		root.unmount();
	});
});
