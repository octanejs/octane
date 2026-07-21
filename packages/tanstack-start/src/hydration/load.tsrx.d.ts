import type { OctaneNode } from 'octane';
import type { HydrationPrefetchStrategy } from '@tanstack/start-client-core/hydration';
import type { HydrateProps, OctaneHydrationStrategy } from '../Hydrate.tsrx';

export declare function LoadHydrate(props: HydrateProps): OctaneNode;

export declare function load(): OctaneHydrationStrategy<'load', true> &
	HydrationPrefetchStrategy<'load'>;
