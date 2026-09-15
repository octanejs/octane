import { describe, expect, it, vi } from 'vitest';
import { signal as coreSignal } from 'alien-signals';
import {
	batch,
	createComputed,
	createEffect,
	createSignal,
	trigger,
} from '@octanejs/alien-signals';
import { mount, nextPaint } from './_helpers';
import {
	LifecycleEffects,
	EffectDependencies,
	FunctionValueReader,
	SetterOnly,
	ScopeProbe,
	SetterProbe,
	SwitchingReader,
	SyncStopScopeProbe,
} from './_fixtures/hooks.tsrx';

describe('@octanejs/alien-signals Octane contracts', () => {
	// @parity-case native:alien-signals-lifecycle-d300cf36f2a2eec1
	it('moves the subscription when signal identity changes', async function movesSubscriptionWhenSignalIdentityChanges() {
		const first = createSignal(1);
		const second = createSignal(10);
		const result = mount(SwitchingReader, { first, second });

		result.click('#switch');
		expect(result.find('#switch-value').textContent).toBe('10');
		first(2);
		await nextPaint();
		expect(result.find('#switch-value').textContent).toBe('10');
		second(11);
		await nextPaint();
		expect(result.find('#switch-value').textContent).toBe('11');
		result.unmount();
	});

	// @parity-case native:alien-signals-lifecycle-2975ae613797eb16
	it('retains setter identity for a stable signal and retargets a replacement', function retainsSetterIdentity() {
		const first = createSignal(1);
		const second = createSignal(10);
		const setters: Array<(value: number | ((previous: number) => number)) => void> = [];
		const record = function recordSetter(
			setter: (value: number | ((previous: number) => number)) => void,
		) {
			setters.push(setter);
		};
		const result = mount(SetterProbe, { source: first, record });
		const initialSetter = setters.at(-1);

		result.click('#rerender');
		expect(setters.at(-1)).toBe(initialSetter);

		result.update(SetterProbe, { source: second, record });
		const replacementSetter = setters.at(-1);
		expect(replacementSetter).not.toBe(initialSetter);
		replacementSetter?.(function increment(value) {
			return value + 1;
		});
		expect(first()).toBe(1);
		expect(second()).toBe(11);
		result.unmount();
	});

	// @parity-case native:alien-signals-lifecycle-0d94be15cc58bca2
	it('runs effect cleanup before reruns and on unmount', async function runsEffectCleanup() {
		const source = createSignal(0);
		const entries: string[] = [];
		const result = mount(LifecycleEffects, {
			source,
			log: function log(entry: string) {
				entries.push(entry);
			},
			onStop: function onStop() {},
		});
		await nextPaint();

		expect(entries).toEqual(['effect:0', 'scope-a:0', 'scope-b:0']);
		source(1);
		expect(entries).toEqual([
			'effect:0',
			'scope-a:0',
			'scope-b:0',
			'cleanup',
			'effect:1',
			'scope-a:1',
			'scope-b:1',
		]);

		result.unmount();
		await nextPaint();
		expect(entries.at(-1)).toBe('cleanup');
		source(2);
		expect(
			entries.filter(function onlyTwo(entry) {
				return entry.endsWith(':2');
			}),
		).toEqual([]);
	});

	// @parity-case native:alien-signals-lifecycle-b838c77a59b24b2d
	it('returns a stop controller that disposes every scoped effect', async function returnsStopController() {
		const source = createSignal(0);
		const entries: string[] = [];
		let stop = function noop() {};
		const result = mount(LifecycleEffects, {
			source,
			log: function log(entry: string) {
				entries.push(entry);
			},
			onStop: function onStop(nextStop: () => void) {
				stop = nextStop;
			},
		});
		await nextPaint();

		stop();
		result.update(LifecycleEffects, {
			source,
			log: function log(entry: string) {
				entries.push(entry);
			},
			onStop: function onStop(nextStop: () => void) {
				stop = nextStop;
			},
		});
		await nextPaint();
		source(1);
		expect(
			entries.filter(function scopedOnes(entry) {
				return entry.startsWith('scope-') && entry.endsWith(':1');
			}),
		).toEqual([]);
		result.unmount();
	});

	// @parity-case native:alien-signals-lifecycle-766c9a06f71b6f01
	it('cancels a scope before commit and remains safe during unmount', async function cancelsScopeBeforeCommit() {
		const source = createSignal(0);
		const entries: string[] = [];
		let stop = function noop() {};
		const result = mount(ScopeProbe, {
			source,
			label: 'pending',
			log: function log(entry: string) {
				entries.push(entry);
			},
			onStop: function onStop(nextStop: () => void) {
				stop = nextStop;
			},
		});

		stop();
		await nextPaint();
		expect(entries).toEqual([]);
		result.unmount();
	});

	// @parity-case native:alien-signals-lifecycle-6a223c32bd3d75d3
	it('stops the prior scope when callback identity changes', async function stopsPriorScopeOnCallbackChange() {
		const source = createSignal(0);
		const entries: string[] = [];
		const props = {
			source,
			label: 'first',
			log: function log(entry: string) {
				entries.push(entry);
			},
			onStop: function onStop() {},
		};
		const result = mount(ScopeProbe, props);
		await nextPaint();
		expect(entries).toEqual(['first:0']);

		result.update(ScopeProbe, { ...props, label: 'second' });
		await nextPaint();
		source(1);
		expect(entries).toEqual(['first:0', 'second:0', 'second:1']);
		result.unmount();
	});

	// @parity-case native:alien-signals-lifecycle-4a1d5e67f98afd08
	it('disposes a scope stopped during synchronous setup', async function disposesScopeStoppedDuringSetup() {
		const source = createSignal(0);
		const entries: string[] = [];
		const stopRef = { current: function noop() {} };
		const result = mount(SyncStopScopeProbe, {
			source,
			log: function log(entry: string) {
				entries.push(entry);
			},
			stopRef,
		});
		await nextPaint();
		expect(entries).toEqual([]);
		source(1);
		expect(entries).toEqual([]);
		result.unmount();
	});

	// @parity-case native:alien-signals-lifecycle-707f8540e96b37fe
	it('keeps direct functional updates and supports setters for unwrapped core signals', () => {
		const own = createSignal(2);
		own((value) => value + 3);
		expect(own()).toBe(5);
		const source = coreSignal(0);
		const result = mount(SetterOnly, { source });
		result.click('#inc');
		expect(source()).toBe(5);
		result.unmount();
	});

	// @parity-case native:alien-signals-lifecycle-e16a03408b640d24
	it('stores a function returned by a hook updater without invoking it', async () => {
		const original = () => 'original';
		const next = vi.fn(() => 'next');
		const source = createSignal(original);
		const result = mount(FunctionValueReader, { source, next });
		result.click('#set-function');
		await nextPaint();
		expect(source()).toBe(next);
		expect(next).not.toHaveBeenCalled();
		result.unmount();
	});

	// @parity-case native:alien-signals-lifecycle-376a8ea81e8a1935
	it('ignores incidental effect return values and cleans function results once', () => {
		const source = createSignal(1);
		const stopValue = createEffect(() => source());
		source(2);
		expect(() => stopValue()).not.toThrow();
		const cleanup = vi.fn();
		const stopCleanup = createEffect(() => {
			source();
			return cleanup;
		});
		source(3);
		expect(cleanup).toHaveBeenCalledTimes(1);
		stopCleanup();
		stopCleanup();
		expect(cleanup).toHaveBeenCalledTimes(2);
	});

	// @parity-case native:alien-signals-lifecycle-576f3dade0b5641a
	it('restores propagation after nested batches and thrown callbacks', () => {
		const source = createSignal(0);
		const seen: number[] = [];
		const stop = createEffect(() => {
			seen.push(source());
		});
		expect(
			batch(() => {
				source(1);
				return batch(() => {
					source(2);
					return 'result';
				});
			}),
		).toBe('result');
		expect(seen).toEqual([0, 2]);
		expect(() =>
			batch(() => {
				source(3);
				throw new Error('failure');
			}),
		).toThrow('failure');
		source(4);
		expect(seen).toEqual([0, 2, 3, 4]);
		stop();
	});

	// @parity-case native:alien-signals-lifecycle-1bd561598a8f46b3
	it('passes the previous computed value and triggers a collected group of signals', () => {
		const first = createSignal([1]);
		const second = createSignal([2]);
		const previous: Array<number | undefined> = [];
		const total = createComputed<number>((old) => {
			previous.push(old);
			return first().length + second().length;
		});
		expect(total()).toBe(2);
		first().push(3);
		second().push(4);
		trigger(() => {
			first();
			second();
		});
		expect(total()).toBe(4);
		expect(previous).toEqual([undefined, 2]);
	});

	// @parity-case native:alien-signals-lifecycle-e8ecdac29d1d619b
	it('keeps effect dependencies explicit while disposing replaced and unmounted effects', async () => {
		const source = createSignal(0);
		const entries: string[] = [];
		const log = (entry: string) => entries.push(entry);
		const result = mount(EffectDependencies, { source, label: 'first', version: 1, log });
		await nextPaint();
		result.update(EffectDependencies, { source, label: 'second', version: 1, log });
		await nextPaint();
		expect(entries).toEqual(['first:0']);
		source(1);
		expect(entries).toEqual(['first:0', 'first:cleanup:0', 'first:1']);
		result.update(EffectDependencies, { source, label: 'second', version: 2, log });
		await nextPaint();
		expect(entries.slice(-2)).toEqual(['first:cleanup:1', 'second:1']);
		result.unmount();
		expect(entries.at(-1)).toBe('second:cleanup:1');
		source(2);
		expect(entries.at(-1)).toBe('second:cleanup:1');
	});
});
