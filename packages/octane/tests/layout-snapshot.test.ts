import { describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot, startTransition } from '../src/index.js';
import * as Server from 'octane/server';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadPlainHookFixtureSource } from './_server-fixture.js';

const source = `
"use strong";
import { Activity, Suspense, use, useLayoutEffect, useLayoutSnapshot, useRef, useState } from 'octane';

export function Measured(props) @{
	const ref = useRef(null);
	const value = useLayoutSnapshot(() => ref.current?.getAttribute('data-value'), {
		initial: 'initial',
	});
	<output ref={ref} data-value={props.value}>{value as string}</output>
}

export function WithoutOptions(props) @{
	const value = useLayoutSnapshot(() => props.value);
	<output>{String(value) as string}</output>
}

export function Structured(props) @{
	const value = useLayoutSnapshot(() => ({ value: props.value }), {
		initial: { value: 'initial' },
		equal: (previous, next) => previous.value === next.value,
	});
	<output>{value.value as string}</output>
}

export function FunctionValue(props) @{
	const value = useLayoutSnapshot(() => props.value);
	<output>{String(value === props.value) as string}</output>
}

export function FunctionInitial(props) @{
	const value = useLayoutSnapshot(() => props.value, { initial: props.initial, equal: props.equal });
	<output>{String(value === props.initial) as string}</output>
}

export function NumericSnapshot(props) @{
	const value = useLayoutSnapshot(() => props.measure(), { initial: props.initial });
	<output>{Object.is(value, -0) ? 'negative zero' : String(value) as string}</output>
}

export function Conditional(props) @{
	let value = 'off';
	if (props.visible) value = useLayoutSnapshot(() => props.value, { initial: 'initial' });
	<output>{value as string}</output>
}

export function ClickMeasurement() @{
	const [count, setCount] = useState(0);
	const ref = useRef(null);
	const value = useLayoutSnapshot(() => ref.current?.getAttribute('data-count'), {
		initial: 'initial',
	});
	<button ref={ref} data-count={count} onClick={() => setCount(count + 1)}>{value as string}</button>
}

function SuspendingMeasurement(props) @{
	const value = useLayoutSnapshot(() => props.measure(), { initial: 'initial' });
	if (props.promise) use(props.promise);
	<output>{value as string}</output>
}

export function Suspended(props) @{
	<Suspense fallback={<p>pending</p>}>
		<SuspendingMeasurement promise={props.promise} measure={props.measure} />
	</Suspense>
}

function LayoutBeforeSuspending(props) @{
	useLayoutEffect(() => { props.onLayout(); });
	use(props.promise);
	<output>{'ready'}</output>
}

export function OrdinarySuspended(props) @{
	<Suspense fallback={<p>pending</p>}>
		<LayoutBeforeSuspending promise={props.promise} onLayout={props.onLayout} />
	</Suspense>
}

export function Feedback() @{
	const value = useLayoutSnapshot(() => ({}), { initial: {} });
	<output>{String(value !== undefined) as string}</output>
}

function ActivityMeasurement(props) @{
	const value = useLayoutSnapshot(() => props.measure(), { initial: 'initial' });
	<output>{value as string}</output>
}

export function ActivityHost(props) @{
	<Activity mode={props.mode}>
		<ActivityMeasurement measure={props.measure} />
	</Activity>
}

export function Throwing(props) @{
	const value = useLayoutSnapshot(() => props.measure(), { initial: 'initial' });
	<output>{value as string}</output>
}

export function ErrorHost(props) @{
	@try {
		<Throwing measure={props.measure} />
	} @catch (error) {
		<p>{error.message as string}</p>
	}
}
`;

function fixture(mode: 'client' | 'server', dev: boolean) {
	return loadCompiledFixtureSource(source, {
		id: '/packages/octane/tests/_fixtures/layout-snapshot.tsrx',
		mode,
		compileOptions: { dev, hmr: false },
	});
}

describe.each([true, false])('layout snapshots (dev: %s)', (dev) => {
	it('measures committed DOM and updates after later commits', () => {
		const { Measured } = fixture('client', dev);
		const view = mount(Measured, { value: 'first' });
		try {
			expect(view.find('output').textContent).toBe('first');
			view.update(Measured, { value: 'second' });
			expect(view.find('output').textContent).toBe('second');
		} finally {
			view.unmount();
		}
	});

	it('supports omitted options, custom equality, and function-valued snapshots', () => {
		const { WithoutOptions, Structured, FunctionValue } = fixture('client', dev);
		const plain = mount(WithoutOptions, { value: 'one' });
		const structured = mount(Structured, { value: 'one' });
		const result = () => 'opaque';
		const functionValue = mount(FunctionValue, { value: result });
		try {
			expect(plain.find('output').textContent).toBe('one');
			expect(structured.find('output').textContent).toBe('one');
			expect(functionValue.find('output').textContent).toBe('true');
			plain.update(WithoutOptions, { value: 'two' });
			structured.update(Structured, { value: 'two' });
			expect(plain.find('output').textContent).toBe('two');
			expect(structured.find('output').textContent).toBe('two');
		} finally {
			plain.unmount();
			structured.unmount();
			functionValue.unmount();
		}
	});

	it('preserves a function initial value on the server and lets custom equality publish the same identity', () => {
		const server = fixture('server', dev);
		const client = fixture('client', dev);
		const value = vi.fn(() => 'opaque');
		let comparisons = 0;
		const equal = () => ++comparisons > 1;
		const props = { initial: value, value, equal };
		expect(Server.renderToString(server.FunctionInitial, props).html).toContain('>true</output>');
		expect(comparisons).toBe(0);
		expect(value).not.toHaveBeenCalled();
		const view = mount(client.FunctionInitial, props);
		try {
			expect(view.find('output').textContent).toBe('true');
			expect(comparisons).toBeGreaterThanOrEqual(2);
			expect(value).not.toHaveBeenCalled();
		} finally {
			view.unmount();
		}
	});

	it('uses Object.is semantics for NaN and signed zero', () => {
		const { NumericSnapshot } = fixture('client', dev);
		const measureNaN = vi.fn(() => NaN);
		const nan = mount(NumericSnapshot, { initial: NaN, measure: measureNaN });
		const zero = mount(NumericSnapshot, { initial: 0, measure: () => -0 });
		try {
			expect(nan.find('output').textContent).toBe('NaN');
			expect(measureNaN).toHaveBeenCalledTimes(1);
			expect(zero.find('output').textContent).toBe('negative zero');
		} finally {
			nan.unmount();
			zero.unmount();
		}
	});

	it('uses the initial value for SSR and adopts the DOM before measuring on hydration', () => {
		const server = fixture('server', dev);
		const client = fixture('client', dev);
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = Server.renderToString(server.Measured, { value: 'client' }).html;
		const output = container.querySelector('output')!;
		expect(output.textContent).toBe('initial');
		const root = hydrateRoot(container, client.Measured, { value: 'client' });
		try {
			flushSync(() => {});
			expect(container.querySelector('output')).toBe(output);
			expect(output.textContent).toBe('client');
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('publishes a committed measurement while another async Action is pending', async () => {
		const { ClickMeasurement } = fixture('client', dev);
		const view = mount(ClickMeasurement);
		let finish!: () => void;
		const pending = new Promise<void>((resolve) => {
			finish = resolve;
		});
		try {
			startTransition(async () => pending);
			(view.find('button') as HTMLButtonElement).click();
			for (let index = 0; index < 10; index++) await Promise.resolve();
			expect(view.find('button').getAttribute('data-count')).toBe('1');
			expect(view.find('button').textContent).toBe('1');
		} finally {
			finish();
			for (let index = 0; index < 10; index++) await Promise.resolve();
			view.unmount();
		}
	});

	it('does not measure work that suspends before commit', () => {
		const { Suspended } = fixture('client', dev);
		let measured = false;
		const view = mount(Suspended, {
			promise: new Promise(() => {}),
			measure: () => {
				measured = true;
				return 'ready';
			},
		});
		try {
			expect(view.find('p').textContent).toBe('pending');
			expect(measured).toBe(false);
		} finally {
			view.unmount();
		}
	});

	it('publishes a snapshot on a suspense resume without another update', async () => {
		const { Suspended } = fixture('client', dev);
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		let count = 0;
		const view = mount(Suspended, {
			promise,
			measure: () => {
				count++;
				return 'ready';
			},
		});
		try {
			expect(view.find('p').textContent).toBe('pending');
			resolve('ok');
			// Retry-only reveals may be throttled after a fallback commits; wait for
			// the actual committed layout callback, not the hidden speculative DOM.
			await vi.waitFor(
				() => {
					expect(count).toBeGreaterThan(0);
					expect(view.find('output').textContent).toBe('ready');
				},
				{ timeout: 2000, interval: 10 },
			);
		} finally {
			view.unmount();
		}
	});

	it('connects an ordinary layout effect before a suspended use on accepted reveal', async () => {
		const { OrdinarySuspended } = fixture('client', dev);
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		let layouts = 0;
		const view = mount(OrdinarySuspended, {
			promise,
			onLayout: () => {
				layouts++;
			},
		});
		try {
			expect(view.find('p').textContent).toBe('pending');
			expect(layouts).toBe(0);
			resolve('ok');
			await vi.waitFor(() => expect(layouts).toBe(1), { timeout: 2000, interval: 10 });
		} finally {
			view.unmount();
		}
	});

	it('does not publish a callback from a suspended update superseded by a newer commit', async () => {
		const { Suspended } = fixture('client', dev);
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		const measured: string[] = [];
		const measure = (value: string) => () => {
			measured.push(value);
			return value;
		};
		const view = mount(Suspended, { promise: null, measure: measure('first') });
		try {
			expect(view.find('output').textContent).toBe('first');
			view.update(Suspended, { promise, measure: measure('abandoned') });
			expect(view.find('p').textContent).toBe('pending');
			view.update(Suspended, { promise: null, measure: measure('latest') });
			expect(view.find('output').textContent).toBe('latest');
			resolve('ok');
			await new Promise((done) => setTimeout(done, 350));
			expect(view.find('output').textContent).toBe('latest');
			expect(measured).not.toContain('abandoned');
		} finally {
			view.unmount();
		}
	});

	it('reconnects the same snapshot call after it is conditionally skipped', () => {
		const { Conditional } = fixture('client', dev);
		const view = mount(Conditional, { visible: true, value: 'first' });
		try {
			expect(view.find('output').textContent).toBe('first');
			view.update(Conditional, { visible: false, value: 'hidden' });
			expect(view.find('output').textContent).toBe('off');
			view.update(Conditional, { visible: true, value: 'second' });
			expect(view.find('output').textContent).toBe('second');
		} finally {
			view.unmount();
		}
	});

	it('does not measure on the server or while Activity is hidden', () => {
		const server = fixture('server', dev);
		const client = fixture('client', dev);
		let measurements = 0;
		const measure = () => {
			measurements++;
			return 'measured';
		};
		const html = Server.renderToString(server.Throwing, { measure }).html;
		expect(html).toContain('initial');
		expect(measurements).toBe(0);
		const view = mount(client.ActivityHost, { mode: 'hidden', measure });
		try {
			expect(measurements).toBe(0);
			view.update(client.ActivityHost, { mode: 'visible', measure });
			expect(view.find('output').textContent).toBe('measured');
			expect(measurements).toBeGreaterThan(0);
		} finally {
			view.unmount();
		}
	});

	it('surfaces errors thrown while measuring', () => {
		const { ErrorHost } = fixture('client', dev);
		const view = mount(ErrorHost, {
			measure: () => {
				throw new Error('measurement failed');
			},
		});
		try {
			flushSync(() => {});
			expect(view.find('p').textContent).toBe('measurement failed');
		} finally {
			view.unmount();
		}
	});

	it('bounds a measurement that cannot converge', async () => {
		const { Feedback } = fixture('client', dev);
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		try {
			await expect(act(() => root.render(Feedback))).rejects.toThrow(
				dev
					? /useLayoutSnapshot in Feedback \(layout-snapshot\.tsrx:\d+:\d+\) did not converge/
					: /useLayoutSnapshot in Feedback did not converge/,
			);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});

it('reports a non-converging async commit in production instead of stranding work', async () => {
	const { Feedback } = fixture('client', false);
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	const originalQueue = globalThis.queueMicrotask;
	const errors: unknown[] = [];
	vi.stubEnv('NODE_ENV', 'production');
	const scheduled = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
		originalQueue(() => {
			try {
				callback();
			} catch (error) {
				errors.push(error);
			}
		});
	});
	try {
		root.render(Feedback);
		for (let index = 0; index < 20; index++) await Promise.resolve();
		expect(errors).toHaveLength(1);
		expect(String(errors[0])).toContain('Minified Octane error #1');
	} finally {
		root.unmount();
		container.remove();
		scheduled.mockRestore();
		vi.unstubAllEnvs();
	}
});

// Outside Strong mode: these fixtures deliberately loop through layout effects.
const loopSource = `
import { useLayoutEffect, useLayoutSnapshot, useRef, useState } from 'octane';

export function CommitsBeforeReporting(props) @{
	const value = useLayoutSnapshot(() => props.next(), { initial: 0 });
	useLayoutEffect(() => {
		props.onLayout(value);
	}, null);
	<output>{String(value) as string}</output>
}

export function LayoutEffectLoop() @{
	const [tick, setTick] = useState(0);
	const ref = useRef(null);
	const value = useLayoutSnapshot(() => ref.current?.getAttribute('data-tick'), {
		initial: '',
	});
	useLayoutEffect(() => {
		if (value === String(tick)) setTick((current) => current + 1);
	}, null);
	<output ref={ref} data-tick={tick}>{value as string}</output>
}
`;

describe.each([true, false])('non-converging layout snapshots (dev: %s)', (dev) => {
	const loops = () =>
		loadCompiledFixtureSource(loopSource, {
			id: '/packages/octane/tests/_fixtures/layout-snapshot-loops.tsrx',
			mode: 'client',
			compileOptions: { dev, hmr: false },
		});

	it('finishes the commit before reporting the depth error', async () => {
		const { CommitsBeforeReporting } = loops();
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		let measurements = 0;
		const committed: number[] = [];
		try {
			await expect(
				act(() =>
					root.render(CommitsBeforeReporting, {
						next: () => ++measurements,
						onLayout: (value: number) => committed.push(value),
					}),
				),
			).rejects.toThrow(/useLayoutSnapshot in CommitsBeforeReporting.* did not converge/);
			// Every commit that measured also ran the layout effect declared after the
			// hook, including the last one: the limit stops the next render instead.
			expect(measurements).toBeGreaterThan(1);
			expect(committed).toHaveLength(measurements);
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it('does not blame a snapshot that settles between passes of another loop', async () => {
		const { LayoutEffectLoop } = loops();
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		let error: unknown;
		try {
			await act(() => root.render(LayoutEffectLoop));
		} catch (caught) {
			error = caught;
		} finally {
			root.unmount();
			container.remove();
		}
		expect(String(error)).toMatch(/Maximum update depth exceeded/);
		expect(String(error)).not.toContain('useLayoutSnapshot');
	});
});

describe('layout snapshot hook call paths', () => {
	it('retains the first initial value during a server render retry', () => {
		const { App } = loadCompiledFixtureSource(
			`import { useLayoutSnapshot, useState } from 'octane';
export function App() @{
  const [count, setCount] = useState(0);
  const value = useLayoutSnapshot(() => 'never measured', { initial: String(count) });
  if (count === 0) setCount(1);
  <output>{value as string}</output>
}`,
			{ id: '/src/layout-snapshot-retry.tsrx', mode: 'server', compileOptions: { hmr: false } },
		);
		expect(Server.renderToString(App).html).toContain('>0</output>');
	});

	it.each([false, true])(
		'supports plain TypeScript hooks with inline memo %s',
		(inlineHookMemo) => {
			const { App } = loadPlainHookFixtureSource(
				`import { createElement, useLayoutSnapshot } from 'octane';
function useValue(value) { return useLayoutSnapshot(() => value); }
export function App(props) {
  const first = useValue(props.first);
  const second = useValue(props.second);
  return createElement('output', null, String(first) + ':' + String(second));
}`,
				{ id: '/src/layout-snapshot.ts', inlineHookMemo },
			);
			const view = mount(App, { first: 'one', second: 'two' });
			try {
				expect(view.find('output').textContent).toBe('one:two');
				view.update(App, { first: 'three', second: 'four' });
				expect(view.find('output').textContent).toBe('three:four');
			} finally {
				view.unmount();
			}
		},
	);

	it.each([false, true])('supports spread arguments with dev=%s', (dev) => {
		const { App } = loadCompiledFixtureSource(
			`import { useLayoutSnapshot } from 'octane';
export function App(props) @{
  const args = [() => props.value] as const;
  const value = useLayoutSnapshot(...args);
  <output>{String(value) as string}</output>
}`,
			{
				id: '/src/layout-snapshot-spread.tsrx',
				mode: 'client',
				compileOptions: { dev, hmr: false },
			},
		);
		const view = mount(App, { value: 'ready' });
		try {
			expect(view.find('output').textContent).toBe('ready');
		} finally {
			view.unmount();
		}
	});
});
