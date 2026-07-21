export { condition, interaction, media } from './hydration/generic.js';
export { idle } from './hydration/idle.js';
export { load } from './hydration/load.tsrx';
export { never } from './hydration/never.tsrx';
export { visible } from './hydration/visible.tsrx';
export type {
	HydrationCondition,
	HydrationInteractionEvent,
	HydrationInteractionEvents,
	IdleHydrationOptions,
	HydrationPrefetchContext,
	HydrationPrefetchFunction,
	HydrationPrefetchWhen,
	HydrationPrefetchStrategy,
	HydrationPrefetchWaitReason,
	HydrationStrategyTypes,
	HydrationWhen,
	VisibleHydrationOptions,
} from '@tanstack/start-client-core/hydration';
export type { HydrationStrategy, OctaneHydrationStrategy } from './Hydrate.tsrx';
