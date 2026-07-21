import type { OctaneNode } from 'octane';
import type {
	HydrationPrefetchStrategy,
	VisibleHydrationOptions,
} from '@tanstack/start-client-core/hydration';
import type { HydrateProps, OctaneHydrationStrategy } from '../Hydrate.tsrx';

export declare function VisibleHydrate(props: HydrateProps): OctaneNode;

export declare function visible(
	options?: VisibleHydrationOptions,
): OctaneHydrationStrategy<'visible', true> & HydrationPrefetchStrategy<'visible'>;
