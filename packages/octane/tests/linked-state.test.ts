import { describe, expect, it } from 'vitest';
import {
	__useLinkedStateWithGetter,
	createElement,
	flushSync,
	startTransition,
	Suspense,
	use,
	useLinkedState,
	useState,
} from '../src/index.js';
import { act, mount } from './_helpers';

type PreviousSource<S, T> = { source: S; value: T } | undefined;

interface LinkedOptions<S, T> {
	sourceEqual?: (previous: S, next: S) => boolean;
	valueEqual?: (previous: T, next: T) => boolean;
}

interface LinkedControls<T> {
	set: (next: T | ((previous: T) => T)) => void;
	get?: () => T;
}

interface LinkedProps<S, T> {
	source: S;
	reconcile: (source: S, previous: PreviousSource<S, T>) => T;
	options?: LinkedOptions<S, T>;
	observe?: (controls: LinkedControls<T>) => void;
	resource?: Promise<unknown> | null;
	getter?: boolean;
}

const LINKED_SLOT = Symbol('linked-state-test');
const INDEPENDENT_SOURCE_SLOT = Symbol('independent-linked-source-test');
const INDEPENDENT_RESOURCE_SLOT = Symbol('independent-linked-resource-test');

function LinkedComponent<S, T>(props: LinkedProps<S, T>) {
	const hook = props.getter ? __useLinkedStateWithGetter : useLinkedState;
	const [value, set, get] = (hook as any)(
		props.source,
		props.reconcile,
		props.options,
		LINKED_SLOT,
	) as [T, LinkedControls<T>['set'], (() => T) | undefined];
	props.observe?.({ set, get });
	if (props.resource != null) use(props.resource);
	return createElement('span', { id: 'linked-value' }, String(value));
}

function LinkedSuspense<S, T>(props: LinkedProps<S, T>) {
	return createElement(
		Suspense,
		{ fallback: createElement('span', { id: 'linked-pending' }, 'loading') },
		createElement(LinkedComponent, props),
	);
}

interface IndependentControls {
	setSource: (source: string) => void;
	setResource: (resource: Promise<unknown> | null) => void;
	setValue: (next: string | ((previous: string) => string)) => void;
	getValue: () => string;
}

function IndependentLinkedSource(props: {
	observe: (controls: Partial<IndependentControls>) => void;
	optionsForSource?: (source: string) => LinkedOptions<string, string>;
}) {
	const [source, setSource] = (useState as any)('A', INDEPENDENT_SOURCE_SLOT) as [
		string,
		(source: string) => void,
	];
	const [value, setValue, getValue] = (__useLinkedStateWithGetter as any)(
		source,
		(next: string) => next,
		props.optionsForSource?.(source),
		LINKED_SLOT,
	) as [string, IndependentControls['setValue'], () => string];
	props.observe({ setSource, setValue, getValue });
	return createElement('span', { id: 'independent-linked-value' }, value);
}

function IndependentSuspendingSibling(props: {
	observe: (controls: Partial<IndependentControls>) => void;
}) {
	const [resource, setResource] = (useState as any)(null, INDEPENDENT_RESOURCE_SLOT) as [
		Promise<unknown> | null,
		(resource: Promise<unknown> | null) => void,
	];
	props.observe({ setResource });
	if (resource !== null) use(resource);
	return createElement('span', { id: 'independent-ready' }, 'ready');
}

function IndependentSuspense(props: {
	observe: (controls: Partial<IndependentControls>) => void;
	optionsForSource?: (source: string) => LinkedOptions<string, string>;
}) {
	return createElement(
		Suspense,
		{ fallback: createElement('span', { id: 'independent-pending' }, 'loading') },
		createElement(
			'div',
			null,
			createElement(IndependentLinkedSource, props),
			createElement(IndependentSuspendingSibling, props),
		),
	);
}

function deferred<T = void>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

describe('useLinkedState', () => {
	it('reports an actionable diagnostic when called without a compiler hook slot', () => {
		expect(() => useLinkedState(1, (source) => source)).toThrow(
			/useLinkedState was called without a hook slot/,
		);
	});

	it('initializes from its source and synchronously reconciles a changed source', () => {
		const previous: Array<PreviousSource<number, number>> = [];
		const reconcile = (source: number, prior: PreviousSource<number, number>) => {
			previous.push(prior);
			return source * 10;
		};
		let controls!: LinkedControls<number>;
		const props = {
			source: 1,
			reconcile,
			observe: (next: LinkedControls<number>) => (controls = next),
		};
		const root = mount(LinkedComponent, props);
		expect(root.find('#linked-value').textContent).toBe('10');
		expect(previous).toEqual([undefined]);

		flushSync(() => controls.set(17));
		expect(root.find('#linked-value').textContent).toBe('17');

		root.update(LinkedComponent, { ...props, source: 2 });
		expect(root.find('#linked-value').textContent).toBe('20');
		expect(previous.at(-1)).toEqual({ source: 1, value: 17 });
		root.unmount();
	});

	it('preserves edits while its source remains unchanged and keeps its setter stable', () => {
		const setters: Array<LinkedControls<number>['set']> = [];
		const reconcile = (source: number) => source;
		const props = {
			source: 3,
			reconcile,
			observe: (controls: LinkedControls<number>) => setters.push(controls.set),
		};
		const root = mount(LinkedComponent, props);

		flushSync(() => setters[0]((value) => value + 2));
		expect(root.find('#linked-value').textContent).toBe('5');
		root.update(LinkedComponent, props);
		expect(root.find('#linked-value').textContent).toBe('5');
		expect(setters.every((setter) => setter === setters[0])).toBe(true);
		root.unmount();
	});

	it('uses the latest reconciler without treating its identity as a source change', () => {
		let controls!: LinkedControls<number>;
		const observe = (next: LinkedControls<number>) => (controls = next);
		const original = (source: number) => source * 2;
		const replacement = (source: number) => source * 3;
		const root = mount(LinkedComponent, { source: 2, reconcile: original, observe });
		flushSync(() => controls.set(11));

		root.update(LinkedComponent, { source: 2, reconcile: replacement, observe });
		expect(root.find('#linked-value').textContent).toBe('11');
		root.update(LinkedComponent, { source: 3, reconcile: replacement, observe });
		expect(root.find('#linked-value').textContent).toBe('9');
		root.unmount();
	});

	it('uses Object.is source equality, including NaN and signed zero', () => {
		const seen: number[] = [];
		const reconcile = (source: number) => {
			seen.push(source);
			return Object.is(source, -0) ? 'negative-zero' : String(source);
		};
		const root = mount(LinkedComponent, { source: NaN, reconcile });
		root.update(LinkedComponent, { source: NaN, reconcile });
		expect(seen).toEqual([NaN]);

		root.update(LinkedComponent, { source: 0, reconcile });
		root.update(LinkedComponent, { source: -0, reconcile });
		expect(root.find('#linked-value').textContent).toBe('negative-zero');
		expect(seen).toEqual([NaN, 0, -0]);
		root.unmount();
	});

	it('honors a custom source comparator without losing the last reconciled source', () => {
		type Source = { id: number; label: string };
		const priorSources: Array<Source | undefined> = [];
		const reconcile = (source: Source, previous: PreviousSource<Source, string>) => {
			priorSources.push(previous?.source);
			return source.label;
		};
		const first = { id: 1, label: 'original' };
		const options = { sourceEqual: (left: Source, right: Source) => left.id === right.id };
		const root = mount(LinkedComponent, { source: first, reconcile, options });
		root.update(LinkedComponent, {
			source: { id: 1, label: 'same identity' },
			reconcile,
			options,
		});
		expect(root.find('#linked-value').textContent).toBe('original');

		root.update(LinkedComponent, {
			source: { id: 2, label: 'different identity' },
			reconcile,
			options,
		});
		expect(root.find('#linked-value').textContent).toBe('different identity');
		expect(priorSources).toEqual([undefined, first]);
		root.unmount();
	});

	it('keeps the last reconciled source when only the value comparator changes', () => {
		type Source = { id: number; label: string };
		const previousSources: Array<Source | undefined> = [];
		const reconcile = (source: Source, previous: PreviousSource<Source, string>) => {
			previousSources.push(previous?.source);
			return source.label;
		};
		const sourceEqual = (previous: Source, next: Source) => previous.id === next.id;
		const original = { id: 1, label: 'original' };
		const sameSource = { id: 1, label: 'equivalent' };
		const firstValueEqual = (previous: string, next: string) => Object.is(previous, next);
		const nextValueEqual = (previous: string, next: string) => Object.is(previous, next);
		const root = mount(LinkedComponent, {
			source: original,
			reconcile,
			options: { sourceEqual, valueEqual: firstValueEqual },
		});

		root.update(LinkedComponent, {
			source: sameSource,
			reconcile,
			options: { sourceEqual, valueEqual: nextValueEqual },
		});
		expect(root.find('#linked-value').textContent).toBe('original');

		root.update(LinkedComponent, {
			source: { id: 2, label: 'different' },
			reconcile,
			options: { sourceEqual, valueEqual: nextValueEqual },
		});
		expect(root.find('#linked-value').textContent).toBe('different');
		expect(previousSources).toEqual([undefined, original]);
		root.unmount();
	});

	it('uses Object.is value equality for NaN and signed-zero local updates', () => {
		let controls!: LinkedControls<number>;
		const root = mount(LinkedComponent, {
			source: 'number',
			reconcile: () => NaN,
			getter: true,
			observe: (next: LinkedControls<number>) => (controls = next),
		});

		flushSync(() => controls.set(NaN));
		expect(controls.get!()).toBeNaN();
		flushSync(() => controls.set(0));
		flushSync(() => controls.set(-0));
		expect(Object.is(controls.get!(), -0)).toBe(true);
		root.unmount();
	});

	it('uses custom value equality for edits and canonicalizes equal reconciled values', () => {
		type Value = { id: number; label: string };
		const priorValues: Value[] = [];
		const original = { id: 1, label: 'original' };
		const reconcile = (source: number, previous: PreviousSource<number, Value>) => {
			if (previous !== undefined) priorValues.push(previous.value);
			return source === 0 ? original : { id: source === 1 ? 1 : 2, label: `source-${source}` };
		};
		let controls!: LinkedControls<Value>;
		const props = {
			source: 0,
			reconcile,
			options: { valueEqual: (left: Value, right: Value) => left.id === right.id },
			getter: true,
			observe: (next: LinkedControls<Value>) => (controls = next),
		};
		const root = mount(LinkedComponent, props);

		flushSync(() => controls.set({ id: 1, label: 'ignored edit' }));
		expect(controls.get!()).toBe(original);

		root.update(LinkedComponent, { ...props, source: 1 });
		expect(controls.get!()).toBe(original);
		root.update(LinkedComponent, { ...props, source: 2 });
		expect(controls.get!()).toEqual({ id: 2, label: 'source-2' });
		expect(priorValues).toEqual([original, original]);
		root.unmount();
	});

	it('provides a stable getter that observes every local update immediately', () => {
		const getters: Array<() => number> = [];
		let controls!: LinkedControls<number>;
		const root = mount(LinkedComponent, {
			source: 4,
			reconcile: (source: number) => source,
			getter: true,
			observe: (next: LinkedControls<number>) => {
				controls = next;
				getters.push(next.get!);
			},
		});

		flushSync(() => {
			controls.set(5);
			expect(controls.get!()).toBe(5);
			controls.set((value) => value + 1);
			expect(controls.get!()).toBe(6);
		});
		expect(root.find('#linked-value').textContent).toBe('6');
		expect(getters.every((getter) => getter === getters[0])).toBe(true);
		root.unmount();
	});

	it('exposes the reconciled draft to its getter during the same rendering pass', () => {
		const observed: string[] = [];
		const props = {
			source: 'first',
			reconcile: (source: string) => source.toUpperCase(),
			getter: true,
			observe: (controls: LinkedControls<string>) => observed.push(controls.get!()),
		};
		const root = mount(LinkedComponent, props);
		root.update(LinkedComponent, { ...props, source: 'second' });
		expect(observed).toEqual(['FIRST', 'SECOND']);
		expect(root.find('#linked-value').textContent).toBe('SECOND');
		root.unmount();
	});

	it('preserves render-time edits when a changed source schedules another render', () => {
		const previous: Array<PreviousSource<string, string>> = [];
		let controls!: LinkedControls<string>;
		let editNextRender = false;
		const props = {
			source: 'A',
			getter: true,
			reconcile: (source: string, prior: PreviousSource<string, string>) => {
				previous.push(prior);
				return source;
			},
			observe: (next: LinkedControls<string>) => {
				controls = next;
				if (!editNextRender) return;
				editNextRender = false;
				next.set((value) => `${value}: first`);
				next.set((value) => `${value}: second`);
			},
		};
		const root = mount(LinkedComponent, props);

		editNextRender = true;
		root.update(LinkedComponent, { ...props, source: 'B' });
		expect(root.find('#linked-value').textContent).toBe('B: first: second');
		expect(controls.get!()).toBe('B: first: second');

		root.update(LinkedComponent, { ...props, source: 'C' });
		expect(previous.at(-1)).toEqual({ source: 'B', value: 'B: first: second' });
		root.unmount();
	});

	it('preserves render-time edits while adopting a new value comparator', () => {
		let controls!: LinkedControls<string>;
		let editNextRender = false;
		const props = {
			source: 'A',
			getter: true,
			reconcile: (source: string) => source,
			observe: (next: LinkedControls<string>) => {
				controls = next;
				if (!editNextRender) return;
				editNextRender = false;
				next.set((value) => `${value}: edited`);
			},
		};
		const root = mount(LinkedComponent, props);
		const valueEqual = (left: string, right: string) => left === right;

		editNextRender = true;
		root.update(LinkedComponent, { ...props, options: { valueEqual } });
		expect(root.find('#linked-value').textContent).toBe('A: edited');
		expect(controls.get!()).toBe('A: edited');
		root.unmount();
	});

	it('preserves edited source drafts when their custom source comparator matches', () => {
		type Source = { id: number; label: string };
		const previous: Array<PreviousSource<Source, string>> = [];
		let controls!: LinkedControls<string>;
		let editNextRender = false;
		const initial = { id: 1, label: 'A' };
		const changed = { id: 2, label: 'B' };
		const options = { sourceEqual: (left: Source, right: Source) => left.id === right.id };
		const props = {
			source: initial,
			getter: true,
			options,
			reconcile: (source: Source, prior: PreviousSource<Source, string>) => {
				previous.push(prior);
				return source.label;
			},
			observe: (next: LinkedControls<string>) => {
				controls = next;
				if (!editNextRender) return;
				editNextRender = false;
				next.set((value) => `${value}: edited`);
			},
		};
		const root = mount(LinkedComponent, props);

		editNextRender = true;
		root.update(LinkedComponent, { ...props, source: changed });
		expect(root.find('#linked-value').textContent).toBe('B: edited');
		expect(controls.get!()).toBe('B: edited');

		root.update(LinkedComponent, { ...props, source: { id: 2, label: 'equivalent' } });
		expect(root.find('#linked-value').textContent).toBe('B: edited');
		root.update(LinkedComponent, { ...props, source: { id: 3, label: 'C' } });
		expect(previous.at(-1)).toEqual({ source: changed, value: 'B: edited' });
		root.unmount();
	});

	it('does not publish a source reconciliation from an aborted Suspense render', async () => {
		const gate = deferred<string>();
		const observed: Array<{ source: string; previous: PreviousSource<string, string> }> = [];
		const reconcile = (source: string, previous: PreviousSource<string, string>) => {
			observed.push({ source, previous });
			return source;
		};
		let controls!: LinkedControls<string>;
		const props = {
			source: 'A',
			reconcile,
			getter: true,
			resource: null as Promise<string> | null,
			observe: (next: LinkedControls<string>) => (controls = next),
		};
		const root = mount(LinkedSuspense, props);
		flushSync(() => controls.set('edited A'));

		root.update(LinkedSuspense, { ...props, source: 'B', resource: gate.promise });
		expect(root.find('#linked-pending').textContent).toBe('loading');
		expect(controls.get!()).toBe('edited A');

		root.update(LinkedSuspense, { ...props, source: 'C', resource: null });
		expect(root.find('#linked-value').textContent).toBe('C');
		expect(observed.filter((entry) => entry.source === 'C').at(-1)?.previous).toEqual({
			source: 'A',
			value: 'edited A',
		});

		await act(() => gate.resolve('stale'));
		expect(root.find('#linked-value').textContent).toBe('C');
		root.unmount();
	});

	it('does not leak a suspended render’s value comparator into committed local updates', async () => {
		const gate = deferred();
		let controls!: LinkedControls<string>;
		const props = {
			source: 'A',
			reconcile: (source: string) => source,
			getter: true,
			resource: null as Promise<void> | null,
			observe: (next: LinkedControls<string>) => (controls = next),
		};
		const root = mount(LinkedSuspense, props);

		root.update(LinkedSuspense, {
			...props,
			source: 'B',
			options: { valueEqual: () => true },
			resource: gate.promise,
		});
		expect(root.find('#linked-pending').textContent).toBe('loading');
		flushSync(() => controls.set('edited A'));
		expect(controls.get!()).toBe('edited A');

		await act(() => gate.resolve());
		root.unmount();
	});

	it('holds an independently completed sibling draft until its Suspense boundary reveals', async () => {
		const gate = deferred();
		const controls = {} as IndependentControls;
		const root = mount(IndependentSuspense, {
			observe: (next: Partial<IndependentControls>) => Object.assign(controls, next),
		});

		flushSync(() => {
			controls.setSource('B');
			controls.setResource(gate.promise);
		});
		expect(root.find('#independent-pending').textContent).toBe('loading');
		expect(controls.getValue()).toBe('A');

		await act(() => gate.resolve());
		expect(root.find('#independent-linked-value').textContent).toBe('B');
		expect(controls.getValue()).toBe('B');
		root.unmount();
	});

	it('preserves concurrent functional edits to a source waiting for Suspense to reveal', async () => {
		const gate = deferred();
		const controls = {} as IndependentControls;
		const root = mount(IndependentSuspense, {
			observe: (next: Partial<IndependentControls>) => Object.assign(controls, next),
		});

		flushSync(() => {
			controls.setSource('B');
			controls.setResource(gate.promise);
		});
		expect(root.find('#independent-pending').textContent).toBe('loading');
		expect(controls.getValue()).toBe('A');

		flushSync(() => {
			controls.setValue((value) => `${value}: first`);
			controls.setValue((value) => `${value}: second`);
		});
		expect(controls.getValue()).toBe('A');

		await act(() => gate.resolve());
		expect(root.find('#independent-linked-value').textContent).toBe('B: first: second');
		expect(controls.getValue()).toBe('B: first: second');
		root.unmount();
	});

	it('keeps parked edits while adopting an inline comparator on a hidden retry', async () => {
		const gate = deferred();
		const controls = {} as IndependentControls;
		let ignoreCase = false;
		const props = {
			observe: (next: Partial<IndependentControls>) => Object.assign(controls, next),
			optionsForSource: () => {
				const caseInsensitive = ignoreCase;
				return {
					valueEqual: (previous: string, next: string) =>
						caseInsensitive ? previous.toLowerCase() === next.toLowerCase() : previous === next,
				};
			},
		};
		const root = mount(IndependentSuspense, props);

		flushSync(() => {
			controls.setSource('B');
			controls.setResource(gate.promise);
		});
		expect(root.find('#independent-pending').textContent).toBe('loading');

		flushSync(() => {
			controls.setValue((value) => `${value}: first`);
			controls.setValue((value) => `${value}: second`);
		});
		expect(controls.getValue()).toBe('A');
		ignoreCase = true;
		root.update(IndependentSuspense, { ...props });
		expect(root.find('#independent-pending').textContent).toBe('loading');
		expect(controls.getValue()).toBe('A');
		flushSync(() => {
			controls.setValue('b: FIRST: SECOND');
			controls.setValue((value) => `${value}!`);
		});
		expect(controls.getValue()).toBe('A');

		await act(() => gate.resolve());
		expect(root.find('#independent-linked-value').textContent).toBe('B: first: second!');
		expect(controls.getValue()).toBe('B: first: second!');
		root.unmount();
	});

	it('uses the parked value comparator while keeping committed getter reads isolated', async () => {
		const gate = deferred();
		const controls = {} as IndependentControls;
		const committedEqual = (left: string, right: string) => left === right;
		const parkedEqual = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
		const root = mount(IndependentSuspense, {
			observe: (next: Partial<IndependentControls>) => Object.assign(controls, next),
			optionsForSource: (source: string) => ({
				valueEqual: source === 'A' ? committedEqual : parkedEqual,
			}),
		});

		flushSync(() => {
			controls.setSource('B');
			controls.setResource(gate.promise);
		});
		flushSync(() => {
			controls.setValue('b');
			controls.setValue((value) => `${value}!`);
		});
		expect(controls.getValue()).toBe('A');

		await act(() => gate.resolve());
		expect(root.find('#independent-linked-value').textContent).toBe('B!');
		expect(controls.getValue()).toBe('B!');
		root.unmount();
	});

	it('discards parked local edits when a newer source replaces the hidden draft', async () => {
		const gate = deferred();
		const controls = {} as IndependentControls;
		const root = mount(IndependentSuspense, {
			observe: (next: Partial<IndependentControls>) => Object.assign(controls, next),
		});

		flushSync(() => {
			controls.setSource('B');
			controls.setResource(gate.promise);
		});
		flushSync(() => controls.setValue((value) => `${value}: stale`));
		expect(controls.getValue()).toBe('A');

		flushSync(() => {
			controls.setSource('C');
			controls.setResource(null);
		});
		expect(root.find('#independent-linked-value').textContent).toBe('C');
		expect(controls.getValue()).toBe('C');

		await act(() => gate.resolve());
		expect(root.find('#independent-linked-value').textContent).toBe('C');
		expect(controls.getValue()).toBe('C');
		root.unmount();
	});

	it('never publishes parked local edits after their Suspense boundary unmounts', async () => {
		const gate = deferred();
		const controls = {} as IndependentControls;
		const root = mount(IndependentSuspense, {
			observe: (next: Partial<IndependentControls>) => Object.assign(controls, next),
		});

		flushSync(() => {
			controls.setSource('B');
			controls.setResource(gate.promise);
		});
		flushSync(() => controls.setValue((value) => `${value}: stale`));
		root.unmount();

		await act(() => gate.resolve());
		expect(controls.getValue()).toBe('A');
	});

	it('never publishes a parked source draft after its Suspense boundary unmounts', async () => {
		const gate = deferred();
		const controls = {} as IndependentControls;
		const root = mount(IndependentSuspense, {
			observe: (next: Partial<IndependentControls>) => Object.assign(controls, next),
		});

		flushSync(() => {
			controls.setSource('B');
			controls.setResource(gate.promise);
		});
		root.unmount();
		await act(() => gate.resolve());
		expect(controls.getValue()).toBe('A');
	});

	it('discards an old transition before parking a new source behind Suspense', async () => {
		const transitionGate = deferred();
		const suspenseGate = deferred();
		const controls = {} as IndependentControls;
		const root = mount(IndependentSuspense, {
			observe: (next: Partial<IndependentControls>) => Object.assign(controls, next),
		});

		flushSync(() => {
			startTransition(async () => {
				controls.setValue('stale A');
				await transitionGate.promise;
			});
		});
		expect(controls.getValue()).toBe('stale A');

		flushSync(() => {
			controls.setSource('B');
			controls.setResource(suspenseGate.promise);
		});
		expect(root.find('#independent-pending').textContent).toBe('loading');
		expect(controls.getValue()).toBe('A');

		await act(() => transitionGate.resolve());
		expect(root.find('#independent-pending').textContent).toBe('loading');
		expect(controls.getValue()).toBe('A');

		await act(() => suspenseGate.resolve());
		expect(root.find('#independent-linked-value').textContent).toBe('B');
		expect(controls.getValue()).toBe('B');
		root.unmount();
	});

	it('discards an unfinished transition update when its source changes urgently', async () => {
		const gate = deferred();
		let controls!: LinkedControls<number>;
		const props = {
			source: 1,
			reconcile: (source: number) => source,
			getter: true,
			observe: (next: LinkedControls<number>) => (controls = next),
		};
		const root = mount(LinkedComponent, props);

		flushSync(() => {
			startTransition(async () => {
				controls.set(9);
				await gate.promise;
			});
		});
		expect(root.find('#linked-value').textContent).toBe('1');

		root.update(LinkedComponent, { ...props, source: 2 });
		expect(root.find('#linked-value').textContent).toBe('2');

		await act(() => gate.resolve());
		expect(root.find('#linked-value').textContent).toBe('2');
		expect(controls.get!()).toBe(2);
		root.unmount();
	});
});
