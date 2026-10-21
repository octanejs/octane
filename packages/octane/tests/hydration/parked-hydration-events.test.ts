import { describe, expect, it, vi } from 'vitest';
import {
	act,
	createRoot,
	getTransitionFallbackTimeout,
	hydrateRoot,
	setTransitionFallbackTimeout,
	startTransition,
} from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

const source = `function Child(props) @{
  @try {
    props.read();
    <div data-content><button data-delegated onClick={props.onDelegated}>delegated</button><x-control data-native onpulse={props.onNative}>native</x-control></div>;
  } @pending { <p>Inner pending</p>; }
}
export function Gate(props) @{
  <main><output>{props.label as string}</output>
    @try {
      props.readOuter();
      <section data-primary><Child read={props.readInner} onDelegated={props.onDelegated} onNative={props.onNative} /></section>;
    } @pending { <p data-fallback>Outer pending</p>; }
  </main>;
}`;

const optimisticSource = `import { useOptimistic, useTransition } from 'octane';
export function Observer(props) @{
  const [value, setValue] = useOptimistic('idle');
  const [pending, start] = useTransition();
  <div><button data-begin onClick={() => start(async () => { setValue('saving'); await props.wait; })}>begin</button><output data-observer>{value as string}:{String(pending)}</output></div>;
}`;

const concurrentSource = `${source}
import { useState } from 'octane';
function Later(props) @{
  const [revision, setRevision] = useState(0);
  props.bindLater(setRevision);
  <section>@try { props.readLater(revision); <output data-later>{String(revision)}</output>; }
    @pending { <p>Later pending</p>; }</section>;
}
export function App(props) @{ <div><Gate {...props} /><Later {...props} /></div>; }`;

describe.each([false, true])('events in a parked hydration reveal (dev: %s)', (dev) => {
	it.each(['ordinary', 'registration recovery', 'transition-held registration recovery'] as const)(
		'publishes resumed handlers: %s',
		async (scenario) => {
			const fails = scenario !== 'ordinary';
			const held = scenario === 'transition-held registration recovery';
			let outerPending = false;
			let resolveOuter!: () => void;
			const outerBlocker = new Promise<void>((resolve) => {
				resolveOuter = resolve;
			});
			let innerPending = false;
			let wakeInner = false;
			const subscribers: Array<() => void> = [];
			const innerBlocker = { then: (callback: () => void) => subscribers.push(callback) };
			const calls: string[] = [];
			const errors: unknown[] = [];
			const props = {
				label: 'initial',
				readOuter: () => {
					if (outerPending) throw outerBlocker;
					if (wakeInner) {
						wakeInner = false;
						innerPending = false;
						subscribers.splice(0).forEach((callback) => callback());
					}
				},
				readInner: () => {
					if (innerPending) throw innerBlocker;
				},
				onDelegated: () => calls.push('delegated'),
				onNative: () => calls.push('native'),
			};
			const load = (mode: 'client' | 'server') =>
				loadCompiledFixtureSource(source, {
					id: '/parked-hydration-events.tsrx',
					mode,
					compileOptions: { dev, hmr: false },
				})['Gate'];
			const container = document.createElement('div');
			document.body.append(container);
			container.innerHTML = renderToString(load('server'), props).html;
			const primary = container.querySelector('[data-primary]')!;
			const content = container.querySelector('[data-content]')!;
			const delegated = container.querySelector('[data-delegated]')!;
			const native = container.querySelector('[data-native]')!;
			const failure = new Error('listener rejected');
			if (fails) {
				const add = native.addEventListener;
				native.addEventListener = function (
					type: string,
					listener: EventListenerOrEventListenerObject,
					options?: boolean | AddEventListenerOptions,
				) {
					if (type === 'pulse' && listener === props.onNative) throw failure;
					add.call(this, type, listener, options);
				};
			}
			innerPending = true;
			const client = load('client');
			const root = hydrateRoot(container, client, props, {
				onRecoverableError: (error) => errors.push(error),
			});
			let other: HTMLDivElement | undefined;
			let otherRoot: ReturnType<typeof createRoot> | undefined;
			let resolveOther: (() => void) | undefined;
			const previousTimeout = held ? getTransitionFallbackTimeout() : undefined;
			try {
				outerPending = true;
				if (held) {
					vi.useFakeTimers();
					setTransitionFallbackTimeout(10);
					await act(() =>
						startTransition(() => root.render(client, { ...props, label: 'updated' })),
					);
					await act(() => vi.advanceTimersByTime(20));
				} else await act(() => root.render(client, { ...props, label: 'updated' }));
				expect(container.querySelector('[data-fallback]')).not.toBeNull();
				if (held) {
					const wait = new Promise<void>((resolve) => (resolveOther = resolve));
					const observer = loadCompiledFixtureSource(optimisticSource, {
						id: '/optimistic-observer.tsrx',
						mode: 'client',
						compileOptions: { dev, hmr: false },
					})['Observer'];
					other = document.createElement('div');
					document.body.append(other);
					otherRoot = createRoot(other);
					otherRoot.render(observer, { wait });
					await act(() => (other!.querySelector('[data-begin]') as HTMLButtonElement).click());
					expect(other.querySelector('[data-observer]')?.textContent).toBe('saving:true');
				}
				wakeInner = true;
				outerPending = false;
				await act(() => resolveOuter());
				if (held) expect(other!.querySelector('[data-observer]')?.textContent).toBe('saving:true');
				expect(container.querySelector('[data-fallback]')).toBeNull();
				expect(container.querySelector('[data-primary]')).toBe(primary);
				if (fails) {
					expect(container.querySelector('[data-content]')).not.toBe(content);
					expect(errors).toHaveLength(1);
					expect((errors[0] as Error).cause).toBe(failure);
				} else {
					expect(container.querySelector('[data-content]')).toBe(content);
					expect(container.querySelector('[data-delegated]')).toBe(delegated);
					expect(container.querySelector('[data-native]')).toBe(native);
					expect(errors).toEqual([]);
				}
				(container.querySelector('[data-delegated]') as HTMLButtonElement).click();
				container.querySelector('[data-native]')!.dispatchEvent(new Event('pulse'));
				expect(calls).toEqual(['delegated', 'native']);
				if (held) {
					await act(() => resolveOther!());
					expect(other!.querySelector('[data-observer]')?.textContent).toBe('idle:false');
				}
			} finally {
				resolveOther?.();
				root.unmount();
				otherRoot?.unmount();
				container.remove();
				other?.remove();
				if (previousTimeout !== undefined) {
					setTransitionFallbackTimeout(previousTimeout);
					vi.useRealTimers();
				}
			}
		},
	);

	it.each(['ordinary', 'registration recovery'] as const)(
		'publishes a ready boundary when a sibling transition ends: %s',
		async (scenario) => {
			let setLater!: (revision: number) => void;
			let resolveOuter!: () => void;
			const outerBlocker = new Promise<void>((resolve) => (resolveOuter = resolve));
			const laterBlocker = new Promise<void>(() => {});
			const subscribers: Array<() => void> = [];
			const innerBlocker = { then: (callback: () => void) => subscribers.push(callback) };
			const calls: string[] = [];
			const errors: unknown[] = [];
			let outerPending = false;
			let innerPending = false;
			let wakeInner = false;
			const props = {
				label: 'initial',
				bindLater: (set: typeof setLater) => (setLater = set),
				readLater: (revision: number) => {
					if (revision === 1) throw laterBlocker;
				},
				readOuter: () => {
					if (outerPending) throw outerBlocker;
					if (wakeInner) {
						wakeInner = false;
						innerPending = false;
						subscribers.splice(0).forEach((callback) => callback());
					}
				},
				readInner: () => {
					if (innerPending) throw innerBlocker;
				},
				onDelegated: () => calls.push('delegated'),
				onNative: () => calls.push('native'),
			};
			const load = (mode: 'client' | 'server') =>
				loadCompiledFixtureSource(concurrentSource, {
					id: '/concurrent-parked-hydration-events.tsrx',
					mode,
					compileOptions: { dev, hmr: false },
				})['App'];
			const container = document.createElement('div');
			document.body.append(container);
			container.innerHTML = renderToString(load('server'), props).html;
			const primary = container.querySelector('[data-primary]')!;
			const native = container.querySelector('[data-native]')!;
			const failure = new Error('listener rejected');
			if (scenario === 'registration recovery') {
				const add = native.addEventListener;
				native.addEventListener = function (
					type: string,
					listener: EventListenerOrEventListenerObject,
					options?: boolean | AddEventListenerOptions,
				) {
					if (type === 'pulse' && listener === props.onNative) throw failure;
					add.call(this, type, listener, options);
				};
			}
			innerPending = true;
			const client = load('client');
			const root = hydrateRoot(container, client, props, {
				onRecoverableError: (error) => errors.push(error),
			});
			const previousTimeout = getTransitionFallbackTimeout();
			try {
				vi.useFakeTimers();
				setTransitionFallbackTimeout(10);
				outerPending = true;
				await act(() => startTransition(() => root.render(client, { ...props, label: 'updated' })));
				await act(() => vi.advanceTimersByTime(20));
				expect(container.querySelector('[data-fallback]')).not.toBeNull();
				setTransitionFallbackTimeout(Infinity);
				await act(() => startTransition(() => setLater(1)));
				expect(container.querySelector('[data-later]')?.textContent).toBe('0');
				outerPending = false;
				wakeInner = true;
				await act(() => resolveOuter());
				expect(container.querySelector('[data-fallback]')).not.toBeNull();
				await act(() => setLater(2));
				expect(container.querySelector('[data-later]')?.textContent).toBe('2');
				expect(container.querySelector('[data-fallback]')).toBeNull();
				expect(container.querySelector('[data-primary]')).toBe(primary);
				if (scenario === 'registration recovery') {
					expect(container.querySelector('[data-native]')).not.toBe(native);
					expect(errors).toHaveLength(1);
					expect((errors[0] as Error).cause).toBe(failure);
				} else {
					expect(container.querySelector('[data-native]')).toBe(native);
					expect(errors).toEqual([]);
				}
				(container.querySelector('[data-delegated]') as HTMLButtonElement).click();
				container.querySelector('[data-native]')!.dispatchEvent(new Event('pulse'));
				expect(calls).toEqual(['delegated', 'native']);
			} finally {
				root.unmount();
				container.remove();
				setTransitionFallbackTimeout(previousTimeout);
				vi.useRealTimers();
			}
		},
	);
});
