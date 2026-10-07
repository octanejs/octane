import { describe, expect, it } from 'vitest';
import { createSignal } from '@octanejs/alien-signals';
import { mount, nextPaint } from './_helpers';
import {
	DependencyListEffects,
	LifecycleEffects,
	ScopeProbe,
	SetterProbe,
	SwitchingReader,
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

	it('returns a stable stop that disposes the active scope until it is replaced', async function returnsStableStop() {
		const source = createSignal(0);
		const entries: string[] = [];
		const stops: Array<() => void> = [];
		const props = {
			source,
			log: function log(entry: string) {
				entries.push(entry);
			},
			onStop: function onStop(nextStop: () => void) {
				stops.push(nextStop);
			},
		};
		const result = mount(LifecycleEffects, props);
		await nextPaint();

		stops.at(-1)?.();
		source(1);
		expect(
			entries.filter(function scopedOnes(entry) {
				return entry.startsWith('scope-') && entry.endsWith(':1');
			}),
		).toEqual([]);

		// The scope callback is a new closure on every render, so the default
		// dependency list starts a replacement scope after the next commit.
		result.update(LifecycleEffects, { ...props });
		await nextPaint();
		expect(stops.at(-1)).toBe(stops[0]);
		expect(
			entries.filter(function scopedOnes(entry) {
				return entry.startsWith('scope-') && entry.endsWith(':1');
			}),
		).toEqual(['scope-a:1', 'scope-b:1']);

		stops.at(-1)?.();
		source(2);
		expect(
			entries.filter(function scopedTwos(entry) {
				return entry.startsWith('scope-') && entry.endsWith(':2');
			}),
		).toEqual([]);
		result.unmount();
	});

	it('treats a stop before commit as a no-op and disposes on unmount', async function stopBeforeCommitIsNoop() {
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
		expect(entries).toEqual(['pending:0']);
		result.unmount();
		await nextPaint();
		source(1);
		expect(entries).toEqual(['pending:0']);
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

	it('keeps explicit dependency lists across renders and replaces work when they change', async function honorsExplicitDependencyLists() {
		const source = createSignal(0);
		const signals = [source] as const;
		const entries: string[] = [];
		const props = {
			source,
			signals,
			label: 'a',
			log: function log(entry: string) {
				entries.push(entry);
			},
		};
		const result = mount(DependencyListEffects, props);
		await nextPaint();
		expect(entries).toEqual(['layout:a', 'effect:a:0', 'scope:a:0']);

		// New closures with unchanged dependencies keep the running work.
		result.update(DependencyListEffects, { ...props });
		await nextPaint();
		expect(entries).toEqual(['layout:a', 'effect:a:0', 'scope:a:0']);

		entries.length = 0;
		source(1);
		await nextPaint();
		expect(entries).toEqual(['effect-cleanup:a', 'effect:a:1', 'scope:a:1', 'layout:a']);

		entries.length = 0;
		result.update(DependencyListEffects, { ...props, label: 'b' });
		await nextPaint();
		expect(entries).toEqual(['layout:b', 'effect-cleanup:a', 'effect:b:1', 'scope:b:1']);

		entries.length = 0;
		source(2);
		await nextPaint();
		expect(entries).toEqual(['effect-cleanup:b', 'effect:b:2', 'scope:b:2', 'layout:b']);

		entries.length = 0;
		result.unmount();
		await nextPaint();
		source(3);
		expect(entries).toEqual(['effect-cleanup:b']);
	});
});
