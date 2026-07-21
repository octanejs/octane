import type {
	HydrationPrefetchStrategy,
	IdleHydrationOptions,
} from '@tanstack/start-client-core/hydration';
import type { OctaneHydrationStrategy } from '../Hydrate.tsrx';

export declare function idle(
	options?: IdleHydrationOptions,
): OctaneHydrationStrategy<'idle', true> & HydrationPrefetchStrategy<'idle'>;
