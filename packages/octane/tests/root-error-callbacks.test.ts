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
import {
	act,
	createRoot,
	createContext,
	createElement,
	hydrateRoot,
	flushSync,
} from '../src/index.js';
import {
	CaughtHost,
	UncaughtHost,
	CaughtEffectHost,
	UncaughtEffectHost,
	MountThrower,
	ClickCounter,
	CleanupThrower,
	CleanupHost,
	CaughtCleanupHost,
	RefCleanupHost,
	triggerRenderThrow,
	triggerEffectThrow,
	triggerCleanupThrowerRemoval,
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

	it('onUncaughtError consumes a SYNCHRONOUS first-mount error (first render() mounts sync)', () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		expect(() => root.render(MountThrower, {})).not.toThrow();
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('mount-boom');
		// The failed tree was discarded and the root stays reusable.
		expect(container.textContent).toBe('');
		expect(() => flushSync(() => root.render(CaughtHost, {}))).not.toThrow();
		expect(container.textContent).toBe('ok');
		root.unmount();
	});

	it('preserves an ordinary thrown object whose then getter throws', () => {
		const reason = {
			message: 'opaque render failure',
			get then(): never {
				throw new Error('then accessor is not readable');
			},
		};
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		try {
			root.render(() => {
				throw reason;
			});
			expect(onUncaughtError).toHaveBeenCalledTimes(1);
			// Compare identity without asking assertion formatting to inspect the
			// intentionally opaque value's properties.
			expect(onUncaughtError.mock.calls[0][0] === reason).toBe(true);
			expect(container.textContent).toBe('');
		} finally {
			root.unmount();
		}
	});

	it('control: a synchronous first-mount error without the option still throws', () => {
		const root = createRoot(container);
		expect(() => root.render(MountThrower, {})).toThrow('mount-boom');
		expect(container.textContent).toBe('');
	});

	it('onUncaughtError consumes a hydration render error (unowned root)', async () => {
		container.innerHTML = '<div>server</div>';
		const onUncaughtError = vi.fn();
		let root!: ReturnType<typeof hydrateRoot>;
		expect(() => {
			root = hydrateRoot(container, MountThrower, {}, { onUncaughtError });
		}).not.toThrow();
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('mount-boom');
		// The failed adoption was discarded; the returned root stays usable.
		expect(container.textContent).toBe('');
		await act(() => root.render(ClickCounter, {}));
		expect(container.textContent).toBe('n:0');
		// The recovered root keeps the container's event delegation — a click on
		// freshly rendered content must still reach its handler.
		await act(() => {
			(container.querySelector('#counter') as HTMLElement).click();
		});
		expect(container.textContent).toBe('n:1');
		root.unmount();
	});

	it('a consumed sync-mount error keeps event delegation on the recovered root', async () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		expect(() => root.render(MountThrower, {})).not.toThrow();
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		await act(() => root.render(ClickCounter, {}));
		await act(() => {
			(container.querySelector('#counter') as HTMLElement).click();
		});
		expect(container.textContent).toBe('n:1');
		root.unmount();
	});

	it('control: a hydration render error without the option still throws', () => {
		container.innerHTML = '<div>server</div>';
		expect(() => hydrateRoot(container, MountThrower, {})).toThrow('mount-boom');
	});

	it('onUncaughtError consumes a passive-cleanup throw during root unmount', async () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		await act(() => root.render(CleanupHost, {}));
		errSpy.mockClear();
		await act(() => root.unmount());
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('cleanup-boom');
		expect(errSpy).not.toHaveBeenCalled();
	});

	it('onCaughtError fires when a boundary claims a deletion-phase cleanup throw', async () => {
		const onCaughtError = vi.fn();
		const root = createRoot(container, { onCaughtError });
		await act(() => root.render(CaughtCleanupHost, {}));
		expect(container.querySelector('#ct')).not.toBeNull();
		await act(() => triggerCleanupThrowerRemoval());
		// The deletion's enclosing boundary claimed the error (existing routing)…
		expect(container.textContent).toBe('cleanup-caught');
		// …and the root's reporting callback observed the claim.
		expect(onCaughtError).toHaveBeenCalledTimes(1);
		expect((onCaughtError.mock.calls[0][0] as Error).message).toBe('cleanup-boom');
		root.unmount();
	});

	it('onUncaughtError consumes a ref-cleanup throw during root unmount', async () => {
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		await act(() => root.render(RefCleanupHost, {}));
		errSpy.mockClear();
		await act(() => root.unmount());
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('ref-boom');
		expect(errSpy).not.toHaveBeenCalled();
	});

	it('onUncaughtError consumes a cleanup throw from a Provider children-dialect flip', async () => {
		// A Provider whose `children` prop flips between a value (element) and a
		// function tears the outgoing dialect down MID-RENDER through its own
		// teardown bracket — that path must thread the owner exactly like a
		// normal unmount.
		const onUncaughtError = vi.fn();
		const root = createRoot(container, { onUncaughtError });
		const Ctx = createContext(0);
		const App = (props: any) =>
			createElement(Ctx as any, {
				value: 1,
				children: props.fn ? () => null : createElement(CleanupThrower as any, {}),
			});
		await act(() => root.render(App as any, { fn: false }));
		expect(container.textContent).toBe('ct');
		errSpy.mockClear();
		await act(() => root.render(App as any, { fn: true }));
		expect(onUncaughtError).toHaveBeenCalledTimes(1);
		expect((onUncaughtError.mock.calls[0][0] as Error).message).toBe('cleanup-boom');
		expect(errSpy).not.toHaveBeenCalled();
		root.unmount();
	});

	it('control: teardown throws without the options keep console.error', async () => {
		const root = createRoot(container);
		await act(() => root.render(CleanupHost, {}));
		errSpy.mockClear();
		await act(() => root.unmount());
		expect(errSpy).toHaveBeenCalled();
		expect((errSpy.mock.calls[0][0] as Error).message).toBe('cleanup-boom');
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
