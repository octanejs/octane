import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { act, flushEffects, mount } from './_helpers';
import { loadPlainHookFixtureSource, loadServerFixture } from './_server-fixture';
import { flushSync } from '../src/index.js';
import { ShadowedNestedRowEffect, ShadowedRowEffect } from './_fixtures/for-shadowed-effects.tsrx';
import {
	ShadowedNestedRowEffectStrong,
	ShadowedRowEffectStrong,
} from './_fixtures/for-shadowed-effects-strong.tsrx';
import {
	CallbackReadsItself,
	CallbackReadsLaterConst,
	CallbackReadsLaterVar,
	CallbackReadsReassignedLet,
	CaptureFreeEffect,
	CaptureFreeMemo,
	EffectFromDerivedValue,
	EffectFromCleanupOnly,
	EffectFromDeferredWork,
	EffectFromDestructuring,
	EffectFromModuleScopeHelpers,
	EffectFromOptionalMethodCall,
	EffectFromProps,
	EffectFromReferencedCallback,
	EffectFromState,
	EffectReadsLaterConst,
	EffectReadsLaterVar,
	EffectReadsLetAssignedBefore,
	EffectReadsReassignedLet,
	EffectWithStableHookResults,
	EffectWithConvergingUpdate,
	EffectWithFreshFunction,
	EffectWithFreshObject,
	ExternalHookDependencies,
	ExternalHookLaterDeclaration,
	MemoFromComputedPath,
	MemoFromInstanceMethodCall,
	MemoFromNestedScope,
	MemoFromOpaqueDirectiveClosure,
	MemoFromOptionalPath,
	MemoFromProps,
	MemoFromPrototypeMethodCall,
	MemoFromReferencedFactory,
	MemoFromState,
	MemoReadsLaterConst,
	MemoWithManyDependencies,
	ObjectIsDependencies,
	StoreFieldEffect,
	StoreGetterInsideEffect,
	StoreGetterSelectedEffect,
	StoreSetterEffect,
	withShaderContext,
} from './_fixtures/auto-hook-deps-behavior.tsrx';

function createStore(initial: string) {
	let value = initial;
	let snapshot: {
		xxx: string;
		setState: (next: string) => void;
		getValue: (key: string) => string;
	};
	const listeners = new Set<() => void>();
	const getValue = (_key: string) => value;
	const setState = (next: string) => {
		if (Object.is(value, next)) return;
		value = next;
		snapshot = { xxx: value, setState, getValue };
		for (const listener of [...listeners]) listener();
	};
	snapshot = { xxx: value, setState, getValue };
	return {
		getSnapshot: () => snapshot,
		setState,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

describe('inferred useEffect dependencies — behavior', () => {
	it.each([
		['compatibility', ShadowedNestedRowEffect],
		['Strong', ShadowedNestedRowEffectStrong],
	] as const)(
		'tracks destructured bindings in nested keyed rows in %s mode',
		(_label, Component) => {
			const entries: string[] = [];
			const log = (entry: string) => entries.push(entry);
			const r = mount(Component, {
				groups: [{ id: 'group', items: [{ id: 'row', value: 'a' }] }],
				log,
			});
			flushEffects();
			expect(entries).toEqual(['run:a']);
			r.update(Component, { groups: [{ id: 'group', items: [{ id: 'row', value: 'b' }] }], log });
			flushEffects();
			expect(entries).toEqual(['run:a', 'cleanup:a', 'run:b']);
			r.unmount();
			flushEffects();
			expect(entries).toEqual(['run:a', 'cleanup:a', 'run:b', 'cleanup:b']);
		},
	);

	it.each([
		['compatibility', ShadowedRowEffect],
		['Strong', ShadowedRowEffectStrong],
	] as const)(
		'tracks a shadowing keyed row and the outer empty value in %s mode',
		(_label, Component) => {
			const entries: string[] = [];
			const log = (entry: string) => entries.push(entry);
			const first = { id: '1', value: 'first' };
			const replacement = { id: '1', value: 'second' };
			const r = mount(Component, { items: [], log, emptyValue: 'a', noise: 0 });
			flushEffects();
			expect(entries).toEqual(['empty:outer:a']);
			r.update(Component, { items: [], log, emptyValue: 'a', noise: 1 });
			flushEffects();
			expect(entries).toEqual(['empty:outer:a']);
			r.update(Component, { items: [], log, emptyValue: 'b', noise: 1 });
			flushEffects();
			expect(entries).toEqual(['empty:outer:a', 'empty-cleanup:outer:a', 'empty:outer:b']);
			r.update(Component, { items: [first], log, emptyValue: 'b', noise: 1 });
			flushEffects();
			expect(entries.slice(-2)).toEqual(['empty-cleanup:outer:b', 'run:first']);
			r.update(Component, { items: [replacement], log, emptyValue: 'b', noise: 1 });
			flushEffects();
			expect(entries.slice(-2)).toEqual(['cleanup:first', 'run:second']);
			r.update(Component, { items: [replacement], log, emptyValue: 'b', noise: 2 });
			flushEffects();
			expect(entries.slice(-2)).toEqual(['cleanup:first', 'run:second']);
			r.update(Component, { items: [], log, emptyValue: 'c', noise: 2 });
			flushEffects();
			expect(entries.slice(-2)).toEqual(['cleanup:second', 'empty:outer:c']);
			r.unmount();
			flushEffects();
			expect(entries.at(-1)).toBe('empty-cleanup:outer:c');
		},
	);

	it('ignores unrelated props and refreshes the captured value with ordered cleanup', () => {
		const entries: string[] = [];
		const log = (entry: string) => entries.push(entry);
		const r = mount(EffectFromProps, { log, value: 'a', noise: 0 });
		flushEffects();
		expect(entries).toEqual(['run:a']);

		r.update(EffectFromProps, { log, value: 'a', noise: 1 });
		flushEffects();
		expect(entries).toEqual(['run:a']);

		r.update(EffectFromProps, { log, value: 'b', noise: 2 });
		flushEffects();
		expect(entries).toEqual(['run:a', 'cleanup:a', 'run:b']);

		r.unmount();
		flushEffects();
		expect(entries).toEqual(['run:a', 'cleanup:a', 'run:b', 'cleanup:b']);
	});

	it('moves cleanup and execution to the correct callback when its identity changes', () => {
		const previous: string[] = [];
		const next: string[] = [];
		const previousLog = (entry: string) => previous.push(entry);
		const nextLog = (entry: string) => next.push(entry);
		const r = mount(EffectFromProps, { log: previousLog, value: 'a', noise: 0 });
		flushEffects();

		r.update(EffectFromProps, { log: nextLog, value: 'a', noise: 0 });
		flushEffects();
		expect(previous).toEqual(['run:a', 'cleanup:a']);
		expect(next).toEqual(['run:a']);

		r.unmount();
		flushEffects();
		expect(next).toEqual(['run:a', 'cleanup:a']);
	});

	it('stays inert across renders while an optionally called handler is absent', () => {
		const entries: string[] = [];
		const log = (entry: string) => entries.push(entry);
		const r = mount(EffectFromOptionalMethodCall, { log, noise: 0 });
		flushEffects();
		expect(entries).toEqual(['run']);

		// No handler on either render: the inferred dependency must be as stable
		// as the plain `props.onPing` read it replaces, not the fresh props bag.
		r.update(EffectFromOptionalMethodCall, { log, noise: 1 });
		flushEffects();
		expect(entries).toEqual(['run']);

		const onPing = vi.fn();
		r.update(EffectFromOptionalMethodCall, { log, onPing, noise: 2 });
		flushEffects();
		expect(entries).toEqual(['run', 'run']);
		expect(onPing).toHaveBeenCalledTimes(1);

		r.update(EffectFromOptionalMethodCall, { log, onPing, noise: 3 });
		flushEffects();
		expect(entries).toEqual(['run', 'run']);
		expect(onPing).toHaveBeenCalledTimes(1);
		r.unmount();
	});

	it('reacts to captured state but not sibling state', () => {
		const entries: string[] = [];
		const r = mount(EffectFromState, { log: (entry: string) => entries.push(entry) });
		flushEffects();
		expect(entries).toEqual(['run:0']);

		r.click('.noise');
		flushEffects();
		expect(entries).toEqual(['run:0']);

		r.click('.value');
		flushEffects();
		expect(entries).toEqual(['run:0', 'cleanup:0', 'run:1']);

		r.unmount();
		flushEffects();
	});

	it('tracks values derived through computed access', () => {
		const log = vi.fn();
		const items = [{ label: 'first' }, { label: 'second' }];
		const r = mount(EffectFromDerivedValue, {
			log,
			items,
			index: 0,
			prefix: 'selected',
			noise: 0,
		});
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('selected:first');

		r.update(EffectFromDerivedValue, {
			log,
			items,
			index: 0,
			prefix: 'selected',
			noise: 1,
		});
		flushEffects();
		expect(log).toHaveBeenCalledTimes(1);

		r.update(EffectFromDerivedValue, {
			log,
			items,
			index: 1,
			prefix: 'active',
			noise: 2,
		});
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('active:second');
		expect(log).toHaveBeenCalledTimes(2);

		r.unmount();
		flushEffects();
	});

	it('runs a capture-free effect once and its cleanup once', () => {
		delete document.documentElement.dataset.autoDepsRuns;
		delete document.documentElement.dataset.autoDepsCleanups;
		const r = mount(CaptureFreeEffect);
		flushEffects();
		expect(document.documentElement.dataset.autoDepsRuns).toBe('1');

		r.click('button');
		flushEffects();
		expect(document.documentElement.dataset.autoDepsRuns).toBe('1');

		r.unmount();
		flushEffects();
		expect(document.documentElement.dataset.autoDepsCleanups).toBe('1');
		delete document.documentElement.dataset.autoDepsRuns;
		delete document.documentElement.dataset.autoDepsCleanups;
	});

	it('uses a referenced callback identity as the dependency', () => {
		const entries: string[] = [];
		const first = () => {
			entries.push('run:first');
			return () => entries.push('cleanup:first');
		};
		const second = () => {
			entries.push('run:second');
			return () => entries.push('cleanup:second');
		};
		const r = mount(EffectFromReferencedCallback, { effect: first, noise: 0 });
		flushEffects();

		r.update(EffectFromReferencedCallback, { effect: first, noise: 1 });
		flushEffects();
		expect(entries).toEqual(['run:first']);

		r.update(EffectFromReferencedCallback, { effect: second, noise: 2 });
		flushEffects();
		expect(entries).toEqual(['run:first', 'cleanup:first', 'run:second']);

		r.unmount();
		flushEffects();
	});

	it('does not rerun for stable ref and state-update results', () => {
		const observe = vi.fn();
		const r = mount(EffectWithStableHookResults, { observe, seed: 'initial' });
		flushEffects();
		expect(observe).toHaveBeenCalledTimes(1);
		expect(observe.mock.calls[0]?.[0]).toBe('initial');

		r.click('button');
		flushEffects();
		expect(observe).toHaveBeenCalledTimes(1);

		r.unmount();
		flushEffects();
	});

	it('tracks values captured only by the cleanup', () => {
		const connect = vi.fn();
		const disconnect = vi.fn();
		const r = mount(EffectFromCleanupOnly, {
			connect,
			disconnect,
			value: 'a',
			noise: 0,
		});
		flushEffects();
		expect(connect).toHaveBeenCalledTimes(1);

		r.update(EffectFromCleanupOnly, {
			connect,
			disconnect,
			value: 'a',
			noise: 1,
		});
		flushEffects();
		expect(connect).toHaveBeenCalledTimes(1);
		expect(disconnect).not.toHaveBeenCalled();

		r.update(EffectFromCleanupOnly, {
			connect,
			disconnect,
			value: 'b',
			noise: 2,
		});
		flushEffects();
		expect(disconnect).toHaveBeenLastCalledWith('a');
		expect(connect).toHaveBeenCalledTimes(2);

		r.unmount();
		flushEffects();
		expect(disconnect).toHaveBeenLastCalledWith('b');
	});

	it('tracks captures in deferred callbacks and cancels stale work through cleanup', async () => {
		let resolveFirst!: () => void;
		let resolveSecond!: () => void;
		const first = new Promise<void>((resolve) => (resolveFirst = resolve));
		const second = new Promise<void>((resolve) => (resolveSecond = resolve));
		const log = vi.fn();
		const cleanup = vi.fn();
		const r = mount(EffectFromDeferredWork, {
			task: first,
			value: 'first',
			noise: 0,
			log,
			cleanup,
		});
		flushEffects();

		r.update(EffectFromDeferredWork, {
			task: second,
			value: 'second',
			noise: 1,
			log,
			cleanup,
		});
		flushEffects();
		expect(cleanup).toHaveBeenLastCalledWith('first');

		resolveFirst();
		await first;
		expect(log).not.toHaveBeenCalled();

		resolveSecond();
		await second;
		expect(log).toHaveBeenLastCalledWith('second');
		r.unmount();
		flushEffects();
		expect(cleanup).toHaveBeenLastCalledWith('second');
	});

	it('tracks computed destructuring keys, defaults, records, and observers', () => {
		const log = vi.fn();
		const firstRecord = { primary: 'first' };
		const r = mount(EffectFromDestructuring, {
			field: 'primary',
			fallback: 'missing',
			record: firstRecord,
			noise: 0,
			log,
		});
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('first');

		r.update(EffectFromDestructuring, {
			field: 'secondary',
			fallback: 'fallback',
			record: firstRecord,
			noise: 1,
			log,
		});
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('fallback');
		expect(log).toHaveBeenCalledTimes(2);
		r.unmount();
		flushEffects();
	});

	it('reruns when only the computed destructuring key changes', () => {
		const log = vi.fn();
		// One record and one fallback for the whole test, so the computed key is
		// the ONLY thing that can drive a rerun. The neighbouring case varies the
		// key and the fallback together, which a dropped key would survive.
		const record = { primary: 'first', secondary: 'second' };
		const r = mount(EffectFromDestructuring, {
			field: 'primary',
			fallback: 'missing',
			record,
			noise: 0,
			log,
		});
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('first');

		r.update(EffectFromDestructuring, {
			field: 'secondary',
			fallback: 'missing',
			record,
			noise: 0,
			log,
		});
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('second');
		expect(log).toHaveBeenCalledTimes(2);
		r.unmount();
		flushEffects();
	});

	it('reads module-scope helpers correctly without treating them as reactive', () => {
		const log = vi.fn();
		const r = mount(EffectFromModuleScopeHelpers, { value: 1, noise: 0, log });
		flushEffects();
		// The omitted captures still resolve — dropping them from the array must
		// not change what the callback computes.
		expect(log).toHaveBeenLastCalledWith('cfg:fmt:10');

		// An unrelated prop change must not rerun an effect whose only other
		// captures are module-scope constants.
		r.update(EffectFromModuleScopeHelpers, { value: 1, noise: 1, log });
		flushEffects();
		expect(log).toHaveBeenCalledTimes(1);

		r.update(EffectFromModuleScopeHelpers, { value: 2, noise: 1, log });
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('cfg:fmt:20');
		expect(log).toHaveBeenCalledTimes(2);
		r.unmount();
		flushEffects();
	});

	it('converges when an inferred dependency effect updates its own state', async () => {
		const log = vi.fn();
		const r = mount(EffectWithConvergingUpdate, { target: 3, log });
		await act(() => {});
		expect(r.find('.value').textContent).toBe('3');
		expect(log.mock.calls.map(([value]) => value)).toEqual([0, 1, 2, 3]);
		r.unmount();
		flushEffects();
	});

	it('reruns for a function allocated during every render', () => {
		const log = vi.fn();
		const r = mount(EffectWithFreshFunction, { value: 'same', noise: 0, log });
		flushEffects();
		r.update(EffectWithFreshFunction, { value: 'same', noise: 1, log });
		flushEffects();
		expect(log).toHaveBeenCalledTimes(2);
		r.unmount();
		flushEffects();
	});

	it('reruns for an object allocated during every render', () => {
		const log = vi.fn();
		const r = mount(EffectWithFreshObject, { value: 'same', noise: 0, log });
		flushEffects();
		r.update(EffectWithFreshObject, { value: 'same', noise: 1, log });
		flushEffects();
		expect(log).toHaveBeenCalledTimes(2);
		r.unmount();
		flushEffects();
	});
});

describe('inferred useMemo dependencies — behavior', () => {
	it('ignores unrelated props and recomputes from the latest captured values', () => {
		const compute = vi.fn((value: string) => value.toUpperCase());
		const r = mount(MemoFromProps, { compute, value: 'a', noise: 0 });
		expect(r.find('.value').textContent).toBe('A');
		expect(compute).toHaveBeenCalledTimes(1);

		r.update(MemoFromProps, { compute, value: 'a', noise: 1 });
		expect(r.find('.value').textContent).toBe('A');
		expect(compute).toHaveBeenCalledTimes(1);

		r.update(MemoFromProps, { compute, value: 'b', noise: 2 });
		expect(r.find('.value').textContent).toBe('B');
		expect(compute).toHaveBeenCalledTimes(2);
		r.unmount();
	});

	it('recomputes when a captured factory changes identity', () => {
		const first = vi.fn((value: string) => `first:${value}`);
		const second = vi.fn((value: string) => `second:${value}`);
		const r = mount(MemoFromProps, { compute: first, value: 'a', noise: 0 });

		r.update(MemoFromProps, { compute: second, value: 'a', noise: 1 });
		expect(r.find('.value').textContent).toBe('second:a');
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
		r.unmount();
	});

	it('reacts to captured state but not sibling state', () => {
		const compute = vi.fn((value: number) => value * 10);
		const r = mount(MemoFromState, { compute });
		expect(r.find('.computed').textContent).toBe('10');

		r.click('.noise');
		expect(compute).toHaveBeenCalledTimes(1);

		r.click('.value');
		expect(r.find('.computed').textContent).toBe('20');
		expect(compute).toHaveBeenCalledTimes(2);
		r.unmount();
	});

	it('updates optional paths across absent and present values', () => {
		const r = mount(MemoFromOptionalPath, { user: null, noise: 0 });
		expect(r.find('.value').textContent).toBe('anonymous');

		r.update(MemoFromOptionalPath, {
			user: { profile: { name: 'Ada' } },
			noise: 1,
		});
		expect(r.find('.value').textContent).toBe('Ada');

		r.update(MemoFromOptionalPath, {
			user: { profile: { name: 'Grace' } },
			noise: 2,
		});
		expect(r.find('.value').textContent).toBe('Grace');
		r.unmount();
	});

	it('tracks both the collection and key of a computed path', () => {
		const items = [{ label: 'first' }, { label: 'second' }];
		const r = mount(MemoFromComputedPath, { items, index: 0, noise: 0 });
		expect(r.find('.value').textContent).toBe('first');

		r.update(MemoFromComputedPath, { items, index: 1, noise: 1 });
		expect(r.find('.value').textContent).toBe('second');

		const replacement = [{ label: 'new first' }, { label: 'new second' }];
		r.update(MemoFromComputedPath, { items: replacement, index: 1, noise: 2 });
		expect(r.find('.value').textContent).toBe('new second');
		r.unmount();
	});

	it('preserves inference beyond the four-dependency inline fast path', () => {
		const compute = vi.fn((...values: number[]) => values.join(':'));
		const initial = { compute, a: 1, b: 2, c: 3, d: 4, e: 5, noise: 0 };
		const r = mount(MemoWithManyDependencies, initial);
		expect(r.find('.value').textContent).toBe('1:2:3:4:5');

		r.update(MemoWithManyDependencies, { ...initial, noise: 1 });
		expect(compute).toHaveBeenCalledTimes(1);

		r.update(MemoWithManyDependencies, { ...initial, e: 6, noise: 2 });
		expect(r.find('.value').textContent).toBe('1:2:3:4:6');
		expect(compute).toHaveBeenCalledTimes(2);
		r.unmount();
	});

	it('never reads context-bound getters captured by an opaque directive closure (issue #542)', () => {
		// `resource.$` throws outside withShaderContext. The inferred array must
		// track the root binding only, so plain renders perform no `.$` read.
		const build = vi.fn((shader: () => number) => `p:${withShaderContext(shader)}`);
		const r = mount(MemoFromOpaqueDirectiveClosure, { seed: 1, build, noise: 0 });
		expect(r.find('.value').textContent).toBe('p:1');
		expect(build).toHaveBeenCalledTimes(1);

		r.update(MemoFromOpaqueDirectiveClosure, { seed: 1, build, noise: 1 });
		expect(r.find('.value').textContent).toBe('p:1');
		expect(build).toHaveBeenCalledTimes(1);

		r.update(MemoFromOpaqueDirectiveClosure, { seed: 2, build, noise: 2 });
		expect(r.find('.value').textContent).toBe('p:2');
		expect(build).toHaveBeenCalledTimes(2);
		r.unmount();
	});

	it('recomputes a prototype-method call when its receiver value changes (issue #542)', () => {
		const r = mount(MemoFromPrototypeMethodCall);
		expect(r.find('.step').textContent).toBe('0.00');

		r.click('.step');
		expect(r.find('.step').textContent).toBe('0.25');

		r.click('.step');
		expect(r.find('.step').textContent).toBe('0.50');
		r.unmount();
	});

	it('recomputes a prototype-method call when the receiver instance is replaced', () => {
		const r = mount(MemoFromInstanceMethodCall, { prefix: 'a', value: 'x', noise: 0 });
		expect(r.find('.value').textContent).toBe('a:x');

		r.update(MemoFromInstanceMethodCall, { prefix: 'a', value: 'x', noise: 1 });
		expect(r.find('.value').textContent).toBe('a:x');

		r.update(MemoFromInstanceMethodCall, { prefix: 'b', value: 'x', noise: 2 });
		expect(r.find('.value').textContent).toBe('b:x');

		r.update(MemoFromInstanceMethodCall, { prefix: 'b', value: 'y', noise: 3 });
		expect(r.find('.value').textContent).toBe('b:y');
		r.unmount();
	});

	it('keeps a capture-free value stable across unrelated renders', () => {
		const r = mount(CaptureFreeMemo);
		expect(r.find('.identity').textContent).toBe('same');

		r.click('button');
		expect(r.find('.identity').textContent).toBe('same');
		r.unmount();
	});

	it('uses a referenced factory identity as the dependency', () => {
		const first = vi.fn(() => 'first');
		const second = vi.fn(() => 'second');
		const r = mount(MemoFromReferencedFactory, { factory: first, noise: 0 });
		expect(r.find('.value').textContent).toBe('first');

		r.update(MemoFromReferencedFactory, { factory: first, noise: 1 });
		expect(first).toHaveBeenCalledTimes(1);

		r.update(MemoFromReferencedFactory, { factory: second, noise: 2 });
		expect(r.find('.value').textContent).toBe('second');
		expect(second).toHaveBeenCalledTimes(1);
		r.unmount();
	});

	it('tracks outer values used by nested callbacks and default parameters', () => {
		const r = mount(MemoFromNestedScope, { value: 'a', suffix: '!', noise: 0 });
		expect(r.find('.value').textContent).toBe('a!');

		r.update(MemoFromNestedScope, { value: 'a', suffix: '?', noise: 1 });
		expect(r.find('.value').textContent).toBe('a?');

		r.update(MemoFromNestedScope, { value: 'b', suffix: '?', noise: 2 });
		expect(r.find('.value').textContent).toBe('b?');
		r.unmount();
	});

	it('uses Object.is equality for inferred effect and memo dependencies', () => {
		const effect = vi.fn();
		const compute = vi.fn((value: number) =>
			Object.is(value, -0) ? 'negative zero' : String(value),
		);
		const r = mount(ObjectIsDependencies, { effect, compute, value: NaN, noise: 0 });
		flushEffects();
		expect(r.find('.value').textContent).toBe('NaN');
		expect(effect).toHaveBeenCalledTimes(1);
		expect(compute).toHaveBeenCalledTimes(1);

		r.update(ObjectIsDependencies, { effect, compute, value: NaN, noise: 1 });
		flushEffects();
		expect(effect).toHaveBeenCalledTimes(1);
		expect(compute).toHaveBeenCalledTimes(1);

		r.update(ObjectIsDependencies, { effect, compute, value: 0, noise: 2 });
		flushEffects();
		expect(effect).toHaveBeenCalledTimes(2);
		expect(compute).toHaveBeenCalledTimes(2);

		r.update(ObjectIsDependencies, { effect, compute, value: -0, noise: 3 });
		flushEffects();
		expect(r.find('.value').textContent).toBe('negative zero');
		expect(effect).toHaveBeenCalledTimes(3);
		expect(compute).toHaveBeenCalledTimes(3);
		r.unmount();
		flushEffects();
	});
});

describe('inferred dependencies in plain TypeScript custom hooks', () => {
	it('updates effects and memos without authored dependency arrays', () => {
		const entries: string[] = [];
		const log = (entry: string) => entries.push(entry);
		const compute = vi.fn((value: string) => value.toUpperCase());
		const r = mount(ExternalHookDependencies, { log, compute, value: 'a', noise: 0 });
		flushEffects();
		expect(r.find('.value').textContent).toBe('A');
		expect(entries).toEqual(['run:a']);

		r.update(ExternalHookDependencies, { log, compute, value: 'a', noise: 1 });
		flushEffects();
		expect(compute).toHaveBeenCalledTimes(1);
		expect(entries).toEqual(['run:a']);

		r.update(ExternalHookDependencies, { log, compute, value: 'b', noise: 2 });
		flushEffects();
		expect(r.find('.value').textContent).toBe('B');
		expect(compute).toHaveBeenCalledTimes(2);
		expect(entries).toEqual(['run:a', 'cleanup:a', 'run:b']);

		r.unmount();
		flushEffects();
		expect(entries).toEqual(['run:a', 'cleanup:a', 'run:b', 'cleanup:b']);
	});
});

describe('inferred dependencies with subscribed stores', () => {
	it('does not rerun an effect when its stable store action updates the snapshot', () => {
		const store = createStore('initial');
		const onEffect = vi.fn();
		const r = mount(StoreSetterEffect, {
			store,
			onEffect,
			enabled: true,
			next: 'updated',
		});
		flushEffects();
		flushSync(() => {});
		expect(r.find('.value').textContent).toBe('updated');
		expect(onEffect).toHaveBeenCalledTimes(1);

		flushEffects();
		expect(onEffect).toHaveBeenCalledTimes(1);
		r.unmount();
		flushEffects();
	});

	it('reruns when a replaced store supplies a different stable action', () => {
		const first = createStore('first');
		const second = createStore('second');
		const onEffect = vi.fn();
		const r = mount(StoreSetterEffect, {
			store: first,
			onEffect,
			enabled: true,
			next: 'selected',
		});
		flushEffects();
		flushSync(() => {});

		r.update(StoreSetterEffect, {
			store: second,
			onEffect,
			enabled: true,
			next: 'selected',
		});
		flushEffects();
		flushSync(() => {});
		expect(r.find('.value').textContent).toBe('selected');
		expect(onEffect).toHaveBeenCalledTimes(2);
		r.unmount();
		flushEffects();
	});

	it('reruns for a directly captured store field after a subscribed update', () => {
		const store = createStore('first');
		const log = vi.fn();
		const r = mount(StoreFieldEffect, { store, log });
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('first');

		flushSync(() => store.setState('second'));
		flushEffects();
		expect(r.find('.value').textContent).toBe('second');
		expect(log).toHaveBeenLastCalledWith('second');
		expect(log).toHaveBeenCalledTimes(2);
		r.unmount();
		flushEffects();
	});

	it('does not treat an arbitrary call result inside the effect as a subscription', () => {
		const store = createStore('first');
		const log = vi.fn();
		const r = mount(StoreGetterInsideEffect, { store, log });
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('first');

		flushSync(() => store.setState('second'));
		flushEffects();
		expect(r.find('.value').textContent).toBe('second');
		expect(log).toHaveBeenCalledTimes(1);
		r.unmount();
		flushEffects();
	});

	it('reruns when a getValue result is selected during render', () => {
		const store = createStore('first');
		const log = vi.fn();
		const r = mount(StoreGetterSelectedEffect, { store, log });
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('first');

		flushSync(() => store.setState('second'));
		flushEffects();
		expect(r.find('.value').textContent).toBe('second');
		expect(log).toHaveBeenLastCalledWith('second');
		expect(log).toHaveBeenCalledTimes(2);
		r.unmount();
		flushEffects();
	});
});

// Reading a later `let`, `const` or `class` where the hook is called throws, and
// a later `var` is still undefined there, so a list holding it never changes.
// A variable assigned after the call holds its earlier value there. The compiler
// infers `null` instead, and the hook runs on every render.
describe('inferred dependencies that read a later declaration', () => {
	it('runs a useEffect that reads a later const on every render', () => {
		const entries: string[] = [];
		const log = (entry: string) => entries.push(entry);
		const r = mount(EffectReadsLaterConst, { log, prefix: 'a', noise: 0 });
		flushEffects();
		expect(entries).toEqual(['run:a']);

		r.update(EffectReadsLaterConst, { log, prefix: 'a', noise: 1 });
		flushEffects();
		expect(entries).toEqual(['run:a', 'cleanup:a', 'run:a']);

		r.update(EffectReadsLaterConst, { log, prefix: 'b', noise: 2 });
		flushEffects();
		expect(entries).toEqual(['run:a', 'cleanup:a', 'run:a', 'cleanup:a', 'run:b']);

		r.unmount();
		flushEffects();
		expect(entries.at(-1)).toBe('cleanup:b');
	});

	it.each([
		['a useCallback that reads a later const', CallbackReadsLaterConst],
		['a useMemo whose result reads a later const', MemoReadsLaterConst],
		['a useCallback that calls itself', CallbackReadsItself],
	] as const)('refreshes %s', (_label, Component) => {
		const r = mount(Component, { prefix: 'a' });
		expect(r.find('.value').textContent).toBe('a');

		r.update(Component, { prefix: 'b' });
		expect(r.find('.value').textContent).toBe('b');
		r.unmount();
	});

	it('reruns a useEffect that reads a later var when it changes', () => {
		const log = vi.fn();
		const r = mount(EffectReadsLaterVar, { log, prefix: 'a', noise: 0 });
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('run:a');

		r.update(EffectReadsLaterVar, { log, prefix: 'b', noise: 1 });
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('run:b');
		r.unmount();
		flushEffects();
	});

	it('refreshes a useCallback that reads a later var', () => {
		const r = mount(CallbackReadsLaterVar, { prefix: 'a' });
		expect(r.find('.value').textContent).toBe('a');

		r.update(CallbackReadsLaterVar, { prefix: 'b' });
		expect(r.find('.value').textContent).toBe('b');
		r.unmount();
	});

	it('reruns a useEffect whose captured let is assigned after the call', () => {
		const log = vi.fn();
		const r = mount(EffectReadsReassignedLet, { log, a: 'a', b: '', noise: 0 });
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('run:a');

		r.update(EffectReadsReassignedLet, { log, a: 'a', b: 'b', noise: 1 });
		flushEffects();
		expect(log).toHaveBeenLastCalledWith('run:b');
		r.unmount();
		flushEffects();
	});

	it('refreshes a useCallback whose captured let is assigned after the call', () => {
		const r = mount(CallbackReadsReassignedLet, { a: 'a', b: '' });
		expect(r.find('.value').textContent).toBe('a');

		r.update(CallbackReadsReassignedLet, { a: 'a', b: 'b' });
		expect(r.find('.value').textContent).toBe('b');
		r.unmount();
	});

	it('keeps tracking a let assigned before the call', () => {
		const log = vi.fn();
		const r = mount(EffectReadsLetAssignedBefore, { log, a: 'a', b: 'b', noise: 0 });
		flushEffects();
		expect(log.mock.calls).toEqual([['run:b']]);

		r.update(EffectReadsLetAssignedBefore, { log, a: 'a', b: 'b', noise: 1 });
		flushEffects();
		expect(log.mock.calls).toEqual([['run:b']]);

		r.update(EffectReadsLetAssignedBefore, { log, a: 'a', b: 'c', noise: 2 });
		flushEffects();
		expect(log.mock.calls).toEqual([['run:b'], ['run:c']]);
		r.unmount();
		flushEffects();
	});

	it('refreshes hooks that read a later const in a plain TypeScript custom hook', () => {
		const log = vi.fn();
		const r = mount(ExternalHookLaterDeclaration, { log, prefix: 'a', noise: 0 });
		flushEffects();
		expect(r.find('.value').textContent).toBe('A/A');
		expect(log).toHaveBeenLastCalledWith('run:A');

		r.update(ExternalHookLaterDeclaration, { log, prefix: 'b', noise: 1 });
		flushEffects();
		expect(r.find('.value').textContent).toBe('B/B');
		expect(log).toHaveBeenLastCalledWith('run:B');
		r.unmount();
		flushEffects();
	});

	it.each([false, true])('server-renders hooks that read a later binding (dev: %s)', (dev) => {
		const fixtures = 'packages/octane/tests/_fixtures';
		const external = loadPlainHookFixtureSource(
			readFileSync(`${fixtures}/auto-hook-deps-external.ts`, 'utf8'),
			{ id: `/${fixtures}/auto-hook-deps-external.ts`, mode: 'server', inlineHookMemo: !dev },
		);
		const server = loadServerFixture(`${fixtures}/auto-hook-deps-behavior.tsrx`, {
			compileOptions: { dev, hmr: false },
			runtimeModules: { './auto-hook-deps-external.ts': external },
		});
		const render = (name: string, props: Record<string, unknown>) => {
			const container = document.createElement('div');
			container.innerHTML = ServerRuntime.renderToString(server[name], props).html;
			return container.querySelector('.value')?.textContent;
		};
		for (const name of [
			'CallbackReadsLaterConst',
			'MemoReadsLaterConst',
			'CallbackReadsItself',
			'CallbackReadsLaterVar',
		])
			expect(render(name, { prefix: 'a' })).toBe('a');
		expect(render('ExternalHookLaterDeclaration', { prefix: 'a', log() {}, noise: 0 })).toBe('A/A');
	});
});
