import type { Bindable, BindableParams } from '@zag-js/core';
import { isFunction } from '@zag-js/utils';
import { flushSync, useEffect, useRef, useState } from 'octane';

import { subSlot } from './internal';
import { useSafeLayoutEffect } from './use-layout-effect';

function useBindableValue<T>(
	props: () => BindableParams<T>,
	slot: symbol | undefined,
): Bindable<T> {
	const initial = props().value ?? props().defaultValue;
	const eq = props().isEqual ?? Object.is;

	const [initialValue] = useState(initial, subSlot(slot, 'initial'));
	const [value, setValue] = useState(initialValue, subSlot(slot, 'value'));
	const controlled = props().value !== undefined;

	const valueRef = useRef(value, subSlot(slot, 'value-ref'));
	valueRef.current = controlled ? props().value : value;

	const prevValue = useRef(valueRef.current, subSlot(slot, 'previous-value'));
	useSafeLayoutEffect(
		() => {
			prevValue.current = valueRef.current;
		},
		[value, props().value],
		subSlot(slot, 'sync-previous'),
	);

	const setFn = (nextValue: T | ((prev: T) => T)) => {
		const previous = prevValue.current;
		const next = isFunction(nextValue) ? nextValue(previous as T) : nextValue;

		if (props().debug) {
			console.log(`[bindable > ${props().debug}] setValue`, { next, prev: previous });
		}

		// Controlled values stay pinned to props().value (re-synced each render).
		// Uncontrolled updates advance valueRef immediately so mid-transition
		// action chains read the value set() already wrote.
		if (!controlled) {
			valueRef.current = next;
			prevValue.current = next;
			setValue(next);
		}
		if (!eq(next, previous)) props().onChange?.(next, previous);
	};

	return {
		initial: initialValue,
		ref: valueRef,
		get() {
			return (controlled ? props().value : valueRef.current) as T;
		},
		set(nextValue: T | ((prev: T) => T)) {
			const execute = props().sync ? flushSync : (run: () => void) => run();
			execute(() => setFn(nextValue));
		},
		invoke(nextValue: T, previousValue: T) {
			props().onChange?.(nextValue, previousValue);
		},
		hash(nextValue: T) {
			return props().hash?.(nextValue) ?? String(nextValue);
		},
	};
}

function cleanup(fn: VoidFunction, slot?: symbol) {
	useEffect(() => fn, [], subSlot(slot, 'cleanup'));
}

function bindableRef<T>(defaultValue: T, slot?: symbol) {
	const value = useRef(defaultValue, subSlot(slot, 'ref'));
	return {
		get: () => value.current,
		set: (next: T) => {
			value.current = next;
		},
	};
}

export const useBindable = Object.assign(
	<T>(props: () => BindableParams<T>, slot?: symbol) => useBindableValue(props, slot),
	{ cleanup, ref: bindableRef },
);
