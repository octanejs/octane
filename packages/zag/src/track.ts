import { useEffect, useRef } from 'octane';

import { subSlot } from './internal';

export const useTrack = (deps: any[], effect: VoidFunction, slot?: symbol) => {
	const render = useRef(false, subSlot(slot, 'render'));
	const called = useRef(false, subSlot(slot, 'called'));

	useEffect(
		() => {
			const run = render.current && called.current;
			if (run) return effect();
			called.current = true;
		},
		[
			...(deps ?? []).map((dependency) =>
				typeof dependency === 'function' ? dependency() : dependency,
			),
		],
		subSlot(slot, 'tracked-effect'),
	);

	useEffect(
		() => {
			render.current = true;
			return () => {
				render.current = false;
			};
		},
		[],
		subSlot(slot, 'mount-effect'),
	);
};
