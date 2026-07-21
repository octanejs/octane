import type { OctaneNode } from 'octane';
import type { HydrateProps, OctaneHydrationStrategy } from '../Hydrate.tsrx';

export declare function NeverHydrate(props: HydrateProps): OctaneNode;

export declare function never(): OctaneHydrationStrategy<'never', false>;
