// Type declarations for the .tsrx module (resolved by relative path).
import type { OctaneNode } from 'octane';
import type {
	HydrationStrategy as CoreHydrationStrategy,
	HydrationPrefetchFunction,
	HydrationPrefetchStrategy,
	HydrationWhen,
} from '@tanstack/start-client-core/hydration';

export type {
	HydrationInteractionEvent,
	HydrationInteractionEvents,
	HydrationPrefetchContext,
	HydrationPrefetchFunction,
	HydrationPrefetchStrategy,
	HydrationPrefetchWaitReason,
	HydrationWhen,
} from '@tanstack/start-client-core/hydration';

export type OctaneHydrationStrategy<
	TWhen extends HydrationWhen = HydrationWhen,
	TCanPrefetch extends boolean = boolean,
> = CoreHydrationStrategy<TWhen, TCanPrefetch> & {
	_h: (props: HydrateProps) => OctaneNode;
};

export type HydrationStrategy<
	TWhen extends HydrationWhen = HydrationWhen,
	TCanPrefetch extends boolean = boolean,
> = OctaneHydrationStrategy<TWhen, TCanPrefetch>;

export type HydrateWhen = OctaneHydrationStrategy | (() => OctaneHydrationStrategy);

type HydrateCommonOptions = {
	when: HydrateWhen;
	fallback?: OctaneNode;
	onHydrated?: () => void;
};

export type HydrateOptions =
	| (HydrateCommonOptions & {
			prefetch?: never;
			split?: boolean;
	  })
	| (HydrateCommonOptions & {
			prefetch: HydrationPrefetchStrategy;
			split?: true;
	  })
	| (HydrateCommonOptions & {
			prefetch: HydrationPrefetchFunction;
			split?: boolean;
	  });

export type HydrateProps = HydrateOptions & {
	children: OctaneNode;
};

export type InternalHydrateProps = HydrateProps & {
	h?: string;
	p?: () => Promise<void>;
};

export declare function Hydrate(props: HydrateProps): OctaneNode;
