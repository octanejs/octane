import type {
	HydrationCondition,
	HydrationInteractionEvents,
	HydrationPrefetchStrategy,
} from '@tanstack/start-client-core/hydration';
import type { OctaneHydrationStrategy } from '../Hydrate.tsrx';

export declare function media(
	query: string,
): OctaneHydrationStrategy<'media', true> & HydrationPrefetchStrategy<'media'>;

export declare function condition(
	condition: HydrationCondition,
): OctaneHydrationStrategy<'condition', false>;

export declare function interaction(options?: {
	events?: HydrationInteractionEvents;
}): OctaneHydrationStrategy<'interaction', true> & HydrationPrefetchStrategy<'interaction'>;
