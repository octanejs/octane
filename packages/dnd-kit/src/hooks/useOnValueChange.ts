import { useEffect, useRef } from 'octane';
import { subSlot } from '../internal';

type EffectHook = (
	callback: () => void | (() => void),
	dependencies?: any[] | null,
	slot?: symbol,
) => void;

export function useOnValueChange<T>(
	value: T,
	onChange: (value: T, oldValue: T) => void,
	effectOrSlot: EffectHook | symbol | undefined = useEffect,
	compareOrSlot: ((a: T, b: T) => boolean) | symbol | undefined = Object.is,
	maybeSlot?: symbol,
): void {
	const slot =
		typeof effectOrSlot === 'symbol'
			? effectOrSlot
			: typeof compareOrSlot === 'symbol'
				? compareOrSlot
				: maybeSlot;
	const effect = typeof effectOrSlot === 'function' ? effectOrSlot : useEffect;
	const compare = typeof compareOrSlot === 'function' ? compareOrSlot : Object.is;
	const tracked = useRef<T>(value, subSlot(slot, 'tracked'));

	effect(
		() => {
			const oldValue = tracked.current;
			if (!compare(value, oldValue)) {
				tracked.current = value;
				onChange(value, oldValue);
			}
		},
		[onChange, value],
		subSlot(slot, 'effect'),
	);
}
