import { createSubSlot, useEffect, useRef } from 'octane';

const subSlot = createSubSlot({
	parentPrefix: 'input-otp:usePrevious',
	includeParentDescription: false,
	global: false,
});

/** Returns the value observed during the previous committed render. */
export function usePrevious<T>(value: T, slot?: symbol): T | undefined {
	const ref = useRef<T | undefined>(undefined, subSlot(slot, 'ref'));
	useEffect(
		() => {
			ref.current = value;
		},
		[value],
		subSlot(slot, 'effect'),
	);
	return ref.current;
}
