import { describe, expect, it } from 'vitest';
import { createSignal } from '@octanejs/alien-signals';
import { mount, nextPaint } from './_helpers';
import {
	LifecycleEffects,
	ScopeProbe,
	SetterProbe,
	SwitchingReader,
	SyncStopScopeProbe,
} from './_fixtures/hooks.tsrx';

describe('@octanejs/alien-signals Octane contracts', () => {
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
});
