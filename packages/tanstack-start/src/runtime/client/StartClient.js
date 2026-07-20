import { HYDRATION_RANGE_BOUNDARY, createElement, hookSlots, useEffect } from 'octane';
import { RouterProvider } from '@octanejs/tanstack-router';

export function StartClient({ router }) {
	useEffect(
		() => {
			window.$_TSR?.h();
		},
		[],
		startClientEffectSlot,
	);
	return createElement(RouterProvider, { router });
}

StartClient[HYDRATION_RANGE_BOUNDARY] = 'passthrough';
const startClientEffectSlot = Symbol(hookSlots(1));
