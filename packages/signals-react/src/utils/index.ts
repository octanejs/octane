import { type ReadonlySignal, Signal, signal } from '@preact/signals-core';
import {
	createElement,
	Fragment,
	isChildrenBlock,
	useEffect,
	useLayoutEffect,
	useMemo,
} from 'octane';
import type { OctaneNode } from 'octane';
import { useSignal } from '../index.ts';
import { useSignals } from '../runtime/index.ts';
import { splitSlot, subSlot } from '../internal.ts';

interface ShowProps<T = boolean> {
	when: Signal<T> | ReadonlySignal<T> | (() => T);
	fallback?: OctaneNode | (() => OctaneNode);
	children: OctaneNode | ((value: NonNullable<T>) => OctaneNode);
}

function Item(props: { v: unknown; i?: Signal<number>; children: unknown }) {
	useSignals();
	if (typeof props.children === 'function' && !isChildrenBlock(props.children)) {
		return (props.children as (value: unknown, index?: number) => OctaneNode)(
			props.v,
			props.i ? props.i.value : undefined,
		);
	}
	return props.children as OctaneNode;
}

export function Show<T = boolean>(props: ShowProps<T>, ...rest: unknown[]): OctaneNode {
	const [, slot] = splitSlot(rest);
	useSignals(undefined, undefined, subSlot(slot, 'show-signals'));
	const value = typeof props.when === 'function' ? props.when() : props.when.value;
	if (!value) {
		const fallback = props.fallback;
		if (typeof fallback === 'function' && !isChildrenBlock(fallback)) {
			return fallback();
		}
		return fallback ?? null;
	}
	return createElement(Item, { v: value, children: props.children });
}

type ForEach<T> = ReadonlyArray<T> | Signal<ReadonlyArray<T>> | ReadonlySignal<ReadonlyArray<T>>;

interface ForProps<T> {
	each: ForEach<T> | (() => ForEach<T>);
	fallback?: OctaneNode | (() => OctaneNode);
	getKey?: (item: T, index: number) => string | number;
	children: OctaneNode | ((value: T, index: number) => OctaneNode);
}

export function For<T>(props: ForProps<T>, ...rest: unknown[]): OctaneNode {
	const [, slot] = splitSlot(rest);
	useSignals(undefined, undefined, subSlot(slot, 'for-signals'));
	const cache = useMemo(
		function createCache() {
			return new Map<T, { vnode: OctaneNode; i: Signal<number> }>();
		},
		[],
		subSlot(slot, 'for-cache'),
	);
	const list = (typeof props.each === 'function' ? props.each() : props.each) as
		Signal<ReadonlyArray<T>> | ReadonlyArray<T>;
	const listValue = list instanceof Signal ? list.value : list;

	if (!listValue.length) {
		const fallback = props.fallback;
		if (typeof fallback === 'function' && !isChildrenBlock(fallback)) {
			return fallback();
		}
		return fallback ?? null;
	}

	const removed = new Set(cache.keys());
	const items = listValue.map(function mapItem(value, index) {
		removed.delete(value);
		let entry = cache.get(value);
		if (!entry) {
			const i = signal(index);
			const key = props.getKey ? props.getKey(value, index) : index;
			const vnode = createElement(Item, {
				v: value,
				key,
				i,
				children: props.children,
			});
			entry = { vnode, i };
			cache.set(value, entry);
		} else if (entry.i.peek() !== index) {
			entry.i.value = index;
		}
		return entry.vnode;
	});

	removed.forEach(function drop(value) {
		cache.delete(value);
	});

	return createElement(Fragment, { children: items });
}

function useIsomorphicLayoutEffect(
	fn: () => void | (() => void),
	deps: readonly unknown[] | null | undefined,
	slot: symbol,
) {
	if (typeof window !== 'undefined') {
		useLayoutEffect(fn, deps as unknown[] | null | undefined, slot);
		return;
	}
	useEffect(fn, deps as unknown[] | null | undefined, slot);
}

export function useLiveSignal<T>(value: T, ...rest: [slot?: symbol]): Signal<T> {
	const [, slot] = splitSlot(rest);
	const s = useSignal(value, undefined, subSlot(slot, 'live'));
	useIsomorphicLayoutEffect(
		function syncValue() {
			if (s.peek() !== value) {
				s.value = value;
			}
			return undefined;
		},
		[value],
		subSlot(slot, 'live-sync'),
	);
	return s;
}

export function useSignalRef<T>(value: T, ...rest: [slot?: symbol]) {
	const [, slot] = splitSlot(rest);
	const ref = useSignal(value, undefined, subSlot(slot, 'ref')) as Signal<T> & { current: T };
	if (!('current' in ref)) {
		Object.defineProperty(ref, 'current', refSignalProto);
	}
	return ref;
}

const refSignalProto = {
	configurable: true,
	get: function getCurrent(this: Signal) {
		return this.value;
	},
	set: function setCurrent(this: Signal, v: unknown) {
		this.value = v;
	},
};
