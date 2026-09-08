// React-parity act() coverage:
//   - the scope-depth counter suppresses the "update outside act(...)" warning
//   - `setIsOctaneActEnvironment(true)` enables the warning; default is off
//   - updates inside flushSync are also suppressed (matches React's IS_REACT_ACT_ENVIRONMENT semantics)
//   - the warning text mirrors React's so port-from-React tests recognise it
//   - act() always returns a Promise; awaits drain microtasks + passive effects to quiescence
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createRoot, flushSync, setIsOctaneActEnvironment } from '../src/index.js';
import { mount } from './_helpers';
import Counter, {
	ActLayoutLoop,
	ActRenderFailure,
	PreviousProp,
	bump,
	failActRender,
} from './_fixtures/act-warning.tsrx';

describe('act() — React-parity contract', () => {
	let errSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		setIsOctaneActEnvironment(false);
		errSpy.mockRestore();
	});

	it('always returns a Promise (the async testing model)', () => {
		const ret = act(() => 42);
		expect(ret).toBeInstanceOf(Promise);
		return ret.then((value) => expect(value).toBe(42));
	});

	it('drains microtasks + passive effects before resolving (async fn)', async () => {
		let resolveInner!: (v: string) => void;
		const inner = new Promise<string>((r) => {
			resolveInner = r;
		});
		const result = await act(async () => {
			resolveInner('payload');
			return inner;
		});
		expect(result).toBe('payload');
	});

	it('default env flag is off — out-of-act updates emit NO warning', async () => {
		const r = mount(Counter);
		// Direct (non-act, non-flushSync) update — warning should NOT fire because
		// IS_OCTANE_ACT_ENVIRONMENT is false by default.
		bump();
		flushSync(() => {});
		expect(errSpy).not.toHaveBeenCalled();
		r.unmount();
	});

	it('with env flag on: update outside act() warns with the React-shape message', async () => {
		setIsOctaneActEnvironment(true);
		const r = mount(Counter);
		errSpy.mockClear(); // mount's internal scheduling may have fired the warning
		bump(); // ← the offending out-of-act update
		flushSync(() => {});
		expect(errSpy).toHaveBeenCalled();
		const message = errSpy.mock.calls[0][0] as string;
		expect(message).toMatch(/was not wrapped in act/);
		expect(message).toMatch(/act\(\(\) =>/);
		r.unmount();
	});

	it('with env flag on: update INSIDE act() suppresses the warning', async () => {
		setIsOctaneActEnvironment(true);
		const r = mount(Counter);
		errSpy.mockClear();
		await act(() => {
			bump();
		});
		expect(errSpy).not.toHaveBeenCalled();
		r.unmount();
	});

	it('with env flag on: update INSIDE flushSync suppresses the warning', async () => {
		setIsOctaneActEnvironment(true);
		const r = mount(Counter);
		errSpy.mockClear();
		flushSync(() => {
			bump();
		});
		expect(errSpy).not.toHaveBeenCalled();
		r.unmount();
	});

	it('callback failure releases the act scope and restores outside-act warnings', async () => {
		setIsOctaneActEnvironment(true);
		const r = mount(Counter);
		errSpy.mockClear();
		await expect(
			act(() => {
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');
		// Now AFTER the throw, an out-of-act update should warn (depth went back to 0).
		bump();
		flushSync(() => {});
		expect(errSpy).toHaveBeenCalled();
		r.unmount();
	});

	it('a synchronous drain failure releases the act scope before rejecting', async () => {
		setIsOctaneActEnvironment(true);
		const counter = mount(Counter);
		const loopContainer = document.createElement('div');
		document.body.appendChild(loopContainer);
		const loopRoot = createRoot(loopContainer);
		errSpy.mockClear();

		await expect(act(() => loopRoot.render(ActLayoutLoop))).rejects.toThrow(
			/Maximum update depth exceeded/,
		);

		// A post-failure update is outside act. If the synchronous error leaked the
		// scope depth, this diagnostic would remain incorrectly suppressed.
		errSpy.mockClear();
		bump();
		flushSync(() => {});
		expect(errSpy.mock.calls.some(([message]) => String(message).includes('not wrapped'))).toBe(
			true,
		);

		loopRoot.unmount();
		loopContainer.remove();
		counter.unmount();
	});

	it('nested act() — inner failure does not unbalance the outer scope', async () => {
		setIsOctaneActEnvironment(true);
		const r = mount(Counter);
		errSpy.mockClear();
		await act(async () => {
			await expect(
				act(() => {
					throw new Error('inner');
				}),
			).rejects.toThrow('inner');
			// Still inside the outer act: this update must not warn.
			bump();
		});
		expect(errSpy).not.toHaveBeenCalled();
		r.unmount();
	});
});

// Prop updates are one logical transaction even when helpers use nested act.
it('batches nested synchronous act callbacks until their outer callback returns', async () => {
	const container = document.createElement('div');
	const root = createRoot(container);
	await act(() => root.render(PreviousProp, { value: 'initial' }));
	const pending = act(() => {
		void act(() => root.render(PreviousProp, { value: 'first' }));
		void act(() => root.render(PreviousProp, { value: 'second' }));
		root.render(PreviousProp, { value: 'third' });
	});
	expect(container.textContent).toBe('initial');
	await pending;
	root.unmount();
});

it('keeps separate synchronous act calls synchronous before their promises settle', async () => {
	const container = document.createElement('div');
	const root = createRoot(container);
	const mount = act(() => root.render(PreviousProp, { value: 'initial' }));
	const first = act(() => root.render(PreviousProp, { value: 'first' }));
	expect(container.textContent).toBe('initial');
	const second = act(() => root.render(PreviousProp, { value: 'second' }));
	expect(container.textContent).toBe('first');
	await Promise.all([mount, first, second]);
	root.unmount();
});

it.each([
	{ mode: 'sync', frozen: false },
	{ mode: 'async', frozen: false },
	{ mode: 'sync', frozen: true },
	{ mode: 'async', frozen: true },
] as const)(
	'awaited $mode act drains a complete promise checkpoint (frozen timers: $frozen)',
	async ({ mode, frozen }) => {
		const rendered = mount(Counter);
		let pending: Promise<void> = Promise.resolve();
		try {
			if (frozen) vi.useFakeTimers();
			const schedule = () => {
				let chain = Promise.resolve();
				// Positioning middleware awaits several independent platform reads before
				// it finally enqueues a renderer update. No scheduler work exists yet.
				for (let i = 0; i < 40; i++) chain = chain.then(() => {});
				pending = chain.then(bump);
			};
			await act(mode === 'async' ? async () => schedule() : schedule);
			expect(rendered.container.textContent).toBe('1');
		} finally {
			await pending;
			if (frozen) vi.useRealTimers();
			rendered.unmount();
		}
	},
);

it('restores synchronous commits after an async callback rejects', async () => {
	const container = document.createElement('div');
	const root = createRoot(container);
	await act(() => root.render(PreviousProp, { value: 'initial' }));
	try {
		await expect(
			act(async () => {
				await Promise.resolve();
				throw new Error('rejected callback');
			}),
		).rejects.toThrow('rejected callback');
		const first = act(() => root.render(PreviousProp, { value: 'first' }));
		const second = act(() => root.render(PreviousProp, { value: 'second' }));
		expect(container.textContent).toBe('first');
		await Promise.all([first, second]);
	} finally {
		root.unmount();
	}
});

it.each(['sync', 'async'] as const)(
	'rejects %s act when a promise schedules a failing render',
	async (mode) => {
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() => root.render(ActRenderFailure, { message: 'deferred render failed' }));
		try {
			const schedule = () => {
				let chain = Promise.resolve();
				for (let i = 0; i < 40; i++) chain = chain.then(() => {});
				void chain.then(failActRender);
			};
			await expect(act(mode === 'async' ? async () => schedule() : schedule)).rejects.toThrow(
				'deferred render failed',
			);
			await act(() => root.render(PreviousProp, { value: 'recovered' }));
			expect(container.textContent).toBe('(none)');
		} finally {
			root.unmount();
		}
	},
);

it('preserves render and callback errors when an async act fails in both phases', async () => {
	const container = document.createElement('div');
	const root = createRoot(container);
	const callbackError = new Error('callback failed');
	await act(() => root.render(ActRenderFailure, { message: 'render failed' }));
	try {
		const result = act(async () => {
			failActRender();
			await new Promise<void>((resolve) => queueMicrotask(resolve));
			throw callbackError;
		});
		const error = await result.catch((error: unknown) => error);
		expect(error).toBeInstanceOf(AggregateError);
		expect((error as AggregateError).errors).toHaveLength(2);
		expect((error as AggregateError).errors[0].message).toBe('render failed');
		expect((error as AggregateError).errors[1]).toBe(callbackError);
		await act(() => root.render(PreviousProp, { value: 'recovered' }));
		expect(container.textContent).toBe('(none)');
	} finally {
		root.unmount();
	}
});
