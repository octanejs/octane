// React canary `enableFragmentRefs` parity tests for octane.
//
// Stage 1 — basic attach contract: `<Fragment ref={r}>` populates the ref
// with a FragmentInstance bound to its owning Block (sentinel field
// `_ownerBlock`, our name for React's `_fragmentFiber`). Object, callback,
// and effect-visibility shapes are covered. Subsequent stages layer on
// imperative methods (focus, listeners, observers, etc.).
import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../_helpers';
import { FragmentInstance } from '../../src/index.js';
import {
	AliasedFragmentObjectRef,
	AliasedSpreadFragmentObjectRef,
	ExplicitThenSpreadFragmentRef,
	ForeignFragmentAlias,
	FragmentObjectRef,
	FragmentCallbackRef,
	FragmentChangingCallbackRef,
	FragmentEffectListener,
	FragmentRenderPhaseCallbackRef,
	FragmentEffectVisibility,
	FragmentWrappedHostChildren,
	NamespacedFragmentObjectRef,
	NamespacedSpreadFragmentObjectRef,
	OrderedFragmentSpreadEvaluation,
	ReturnedAliasedFragmentObjectRef,
	ReturnedNamespacedFragmentObjectRef,
	ReturnedNamespacedFragmentSpreadEvaluation,
	ShadowedFragmentAlias,
	ShadowedFragmentNamespace,
	SpreadFragmentObjectRef,
	SpreadThenExplicitFragmentRef,
} from './_fixtures/fragment-refs.tsrx';
import {
	AutomaticJsxAliasedFragmentRef,
	AutomaticJsxNamespacedFragmentRef,
	AutomaticJsxNamespacedSpreadFragmentRef,
	AutomaticJsxReturnedSpreadEvaluation,
	AutomaticJsxSpreadFragmentRef,
} from './_fixtures/fragment-refs.tsx';

describe('Fragment refs — basic attach (React enableFragmentRefs parity)', () => {
	it('attaches a FragmentInstance to an object ref', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const r = mount(FragmentObjectRef, { fragRef });
		expect(fragRef.current).not.toBeNull();
		expect(fragRef.current).toBeInstanceOf(FragmentInstance);
		// `_ownerBlock` is the octane analogue of React's `_fragmentFiber`
		// sanity check — proves the instance is bound to its owning Block.
		expect((fragRef.current as FragmentInstance)._ownerBlock).toBeTruthy();
		// The fragment is logically nested inside #parent — the parent div
		// still renders normally and contains the fragment's child.
		expect(r.find('#parent #child').textContent).toBe('hi');
		r.unmount();
		// Object refs are nulled on unmount.
		expect(fragRef.current).toBeNull();
	});

	it.each([
		['aliased', AliasedFragmentObjectRef, '#alias-child', 'aliased'],
		['namespaced', NamespacedFragmentObjectRef, '#namespace-child', 'namespaced'],
		[
			'returned aliased',
			ReturnedAliasedFragmentObjectRef,
			'#returned-alias-child',
			'returned alias',
		],
		[
			'returned namespaced',
			ReturnedNamespacedFragmentObjectRef,
			'#returned-namespace-child',
			'returned namespace',
		],
		[
			'automatic JSX aliased',
			AutomaticJsxAliasedFragmentRef,
			'#tsx-alias-child',
			'automatic alias',
		],
		[
			'automatic JSX namespaced',
			AutomaticJsxNamespacedFragmentRef,
			'#tsx-namespace-child',
			'automatic namespace',
		],
	] as const)(
		'attaches a FragmentInstance through an %s Octane import',
		(_kind, App, selector, text) => {
			const fragRef: { current: FragmentInstance | null } = { current: null };
			const root = mount(App, { fragRef });
			expect(fragRef.current).toBeInstanceOf(FragmentInstance);
			expect(root.find(selector).textContent).toBe(text);
			root.unmount();
			expect(fragRef.current).toBeNull();
		},
	);

	it.each([
		['ordinary', SpreadFragmentObjectRef, '#spread-child', 'spread'],
		['aliased', AliasedSpreadFragmentObjectRef, '#spread-alias-child', 'spread alias'],
		[
			'namespaced',
			NamespacedSpreadFragmentObjectRef,
			'#spread-namespace-child',
			'spread namespace',
		],
		['automatic JSX', AutomaticJsxSpreadFragmentRef, '#tsx-spread-child', 'automatic spread'],
		[
			'automatic JSX namespace',
			AutomaticJsxNamespacedSpreadFragmentRef,
			'#tsx-spread-namespace-child',
			'automatic namespace spread',
		],
	] as const)(
		'attaches a FragmentInstance through an %s spread ref',
		(_kind, App, selector, text) => {
			const fragRef: { current: FragmentInstance | null } = { current: null };
			const root = mount(App, { spread: { ref: fragRef } });
			expect(fragRef.current).toBeInstanceOf(FragmentInstance);
			expect(root.find(selector).textContent).toBe(text);
			root.unmount();
			expect(fragRef.current).toBeNull();
		},
	);

	it('lets a later spread override an explicit Fragment ref', () => {
		const explicit: { current: FragmentInstance | null } = { current: null };
		const spread: { current: FragmentInstance | null } = { current: null };
		const root = mount(ExplicitThenSpreadFragmentRef, {
			fragRef: explicit,
			spread: { ref: spread },
		});

		expect(explicit.current).toBeNull();
		expect(spread.current).toBeInstanceOf(FragmentInstance);
		root.unmount();
		expect(spread.current).toBeNull();
	});

	it('lets a later explicit Fragment ref override a spread', () => {
		const explicit: { current: FragmentInstance | null } = { current: null };
		const spread: { current: FragmentInstance | null } = { current: null };
		const root = mount(SpreadThenExplicitFragmentRef, {
			fragRef: explicit,
			spread: { ref: spread },
		});

		expect(spread.current).toBeNull();
		expect(explicit.current).toBeInstanceOf(FragmentInstance);
		root.unmount();
		expect(explicit.current).toBeNull();
	});

	it.each([
		['template', OrderedFragmentSpreadEvaluation],
		['returned automatic JSX', AutomaticJsxReturnedSpreadEvaluation],
		['returned namespaced TSRX', ReturnedNamespacedFragmentSpreadEvaluation],
	] as const)(
		'evaluates %s Fragment spreads and getters once in authored order before children',
		(_kind, App) => {
			const calls: string[] = [];
			const firstRef: { current: FragmentInstance | null } = { current: null };
			const explicit: { current: FragmentInstance | null } = { current: null };
			const lastRef: { current: FragmentInstance | null } = { current: null };
			const first = {
				get ref() {
					calls.push('first:getter');
					return firstRef;
				},
			};
			const last = {
				get ref() {
					calls.push('last:getter');
					return lastRef;
				},
			};
			const root = mount(App, {
				first,
				last,
				explicit,
				observe: (label: string, value: unknown) => {
					calls.push(label);
					return value;
				},
			});

			expect(calls).toEqual([
				'first:expression',
				'first:getter',
				'explicit',
				'last:expression',
				'last:getter',
				'child',
			]);
			expect(firstRef.current).toBeNull();
			expect(explicit.current).toBeNull();
			expect(lastRef.current).toBeInstanceOf(FragmentInstance);
			root.unmount();
		},
	);

	it('accepts a Fragment spread without a ref', () => {
		const root = mount(SpreadFragmentObjectRef, { spread: {} });
		expect(root.find('#spread-child').textContent).toBe('spread');
		root.unmount();
	});

	it.each([null, undefined])('accepts a nullish Fragment spread (%s)', (spread) => {
		const root = mount(SpreadFragmentObjectRef, { spread: spread as never });
		expect(root.find('#spread-child').textContent).toBe('spread');
		root.unmount();
	});

	it('updates spread-supplied refs without replacing the FragmentInstance', () => {
		const first: { current: FragmentInstance | null } = { current: null };
		const second: { current: FragmentInstance | null } = { current: null };
		const root = mount(SpreadFragmentObjectRef, { spread: { ref: first } });
		const fragment = first.current;

		root.update(SpreadFragmentObjectRef, { spread: { ref: second } });
		expect(first.current).toBeNull();
		expect(second.current).toBe(fragment);

		root.update(SpreadFragmentObjectRef, { spread: {} });
		expect(second.current).toBeNull();

		root.update(SpreadFragmentObjectRef, { spread: { ref: first } });
		expect(first.current).toBe(fragment);
		root.unmount();
		expect(first.current).toBeNull();
	});

	it.each([
		['aliased', ShadowedFragmentAlias],
		['namespaced', ShadowedFragmentNamespace],
	] as const)('preserves a locally shadowed %s Fragment component', (_kind, App) => {
		const targetRef: { current: HTMLButtonElement | null } = { current: null };
		const root = mount(App, { fragRef: targetRef });
		expect(targetRef.current).toBe(root.find('#local-ref-target'));
		expect(targetRef.current).not.toBeInstanceOf(FragmentInstance);
		root.unmount();
		expect(targetRef.current).toBeNull();
	});

	it('does not reinterpret an unrelated imported component as an Octane Fragment', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const root = mount(ForeignFragmentAlias, { fragRef });
		expect(root.findAll('p').map((element) => element.textContent)).toEqual(['1', '2']);
		expect(fragRef.current).toBeNull();
		root.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js:737.
	it('applies event listeners to host children nested within non-host children', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const root = mount(FragmentWrappedHostChildren, { fragRef });
		const clicked: string[] = [];
		fragRef.current!.addEventListener('click', (event) => {
			clicked.push((event.target as Element).id);
		});
		root.click('#wrapped-direct');
		root.click('#wrapped-nested');
		expect(clicked).toEqual(['wrapped-direct', 'wrapped-nested']);
		root.unmount();
	});

	it('accepts a callback ref and fires it with the FragmentInstance', () => {
		let captured: FragmentInstance | null | undefined;
		const log: Array<FragmentInstance | null> = [];
		const cb = (value: unknown) => {
			const fi = value as FragmentInstance | null;
			captured = fi;
			log.push(fi);
		};
		const r = mount(FragmentCallbackRef, { cb });
		expect(captured).not.toBeNull();
		expect(captured).toBeInstanceOf(FragmentInstance);
		expect((captured as FragmentInstance)._ownerBlock).toBeTruthy();
		r.unmount();
		// Callback refs fire once with the instance on mount and once with
		// null on unmount, matching React's contract.
		expect(log[0]).toBeInstanceOf(FragmentInstance);
		expect(log[log.length - 1]).toBeNull();
	});

	it('detaches a changed callback before attaching its replacement to the same instance', () => {
		const log: string[] = [];
		let firstInstance: FragmentInstance | null = null;
		let secondInstance: FragmentInstance | null = null;
		const first = (value: unknown) => {
			const instance = value as FragmentInstance | null;
			log.push(instance === null ? 'first:detach' : 'first:attach');
			if (instance !== null) firstInstance = instance;
		};
		const second = (value: unknown) => {
			const instance = value as FragmentInstance | null;
			log.push(instance === null ? 'second:detach' : 'second:attach');
			if (instance !== null) secondInstance = instance;
		};
		const r = mount(FragmentChangingCallbackRef, { cb: first });

		r.update(FragmentChangingCallbackRef, { cb: second });
		expect(log).toEqual(['first:attach', 'first:detach', 'second:attach']);
		expect(secondInstance).toBe(firstInstance);

		r.unmount();
		expect(log).toEqual(['first:attach', 'first:detach', 'second:attach', 'second:detach']);
	});

	it('does not attach a Fragment ref discarded by a render-phase replay', () => {
		const discardedAttachments: unknown[] = [];
		const committedAttachments: unknown[] = [];
		const r = mount(FragmentRenderPhaseCallbackRef, {
			first: (value: unknown) => {
				if (value !== null) discardedAttachments.push(value);
			},
			second: (value: unknown) => {
				if (value !== null) committedAttachments.push(value);
			},
		});

		expect(discardedAttachments).toEqual([]);
		expect(committedAttachments.length).toBeGreaterThan(0);
		expect(new Set(committedAttachments).size).toBe(1);
		expect(committedAttachments[0]).toBeInstanceOf(FragmentInstance);
		r.unmount();
	});

	it('is populated by the time useLayoutEffect AND useEffect run', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		let layoutSeen: FragmentInstance | null | undefined;
		let passiveSeen: FragmentInstance | null | undefined;
		const r = mount(FragmentEffectVisibility, {
			fragRef,
			onLayout: (value: unknown) => {
				layoutSeen = value as FragmentInstance | null;
			},
			onPassive: (value: unknown) => {
				passiveSeen = value as FragmentInstance | null;
			},
		});
		// useLayoutEffect is sync at commit, so layoutSeen is already populated.
		expect(layoutSeen).toBeInstanceOf(FragmentInstance);
		// useEffect (passive) runs after the macrotask boundary; flush it
		// synchronously through the test helper.
		flushEffects();
		expect(passiveSeen).toBeInstanceOf(FragmentInstance);
		// Both effects see the SAME instance — mounted once.
		expect(layoutSeen).toBe(passiveSeen);
		expect(layoutSeen).toBe(fragRef.current);
		r.unmount();
	});

	// Per ReactDOMFragmentRefs-test.js:772.
	it('allows adding and cleaning up listeners in effects', () => {
		const fragRef: { current: FragmentInstance | null } = { current: null };
		const clicked: string[] = [];
		const onClick: EventListener = (event) => {
			clicked.push((event.currentTarget as Element).id);
		};
		const root = mount(FragmentEffectListener, { fragRef, onClick, revision: 0 });
		flushEffects();
		const child = root.find('#effect-listener-child') as HTMLElement;
		child.click();
		expect(clicked).toEqual(['effect-listener-child']);

		root.update(FragmentEffectListener, { fragRef, onClick, revision: 1 });
		flushEffects();
		expect(root.find('#effect-listener-child')).toBe(child);
		child.click();
		expect(clicked).toEqual(['effect-listener-child', 'effect-listener-child']);

		root.unmount();
		child.click();
		expect(clicked).toEqual(['effect-listener-child', 'effect-listener-child']);
	});
});
