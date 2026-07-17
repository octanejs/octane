export type HydrationWhen =
	| 'load'
	| 'idle'
	| 'visible'
	| 'media'
	| 'interaction'
	| 'condition'
	| 'never'
	| 'dynamic';

export type HydrationInteractionEvent =
	| 'auxclick'
	| 'click'
	| 'contextmenu'
	| 'dblclick'
	| 'focusin'
	| 'keydown'
	| 'keyup'
	| 'mousedown'
	| 'mouseenter'
	| 'mouseover'
	| 'mouseup'
	| 'pointerdown'
	| 'pointerenter'
	| 'pointerover'
	| 'pointerup';

export type HydrationInteractionEvents =
	| HydrationInteractionEvent
	| ReadonlyArray<HydrationInteractionEvent>;

export type HydrationMarkerAttributes = Record<string, string | undefined>;

/** The runtime-owned gate exposed to a strategy while it is installed. */
export type HydrationRuntimeGate = {
	id?: string;
	when?: HydrationWhen;
	resolved: boolean;
	resolve: () => void;
};

/** The installation context passed to a hydration or prefetch strategy. */
export type HydrationRuntimeContext = {
	element: Element | null;
	gate?: HydrationRuntimeGate;
	prefetch?: () => void;
	delegated?: boolean;
};

export type HydrationStrategyTypes<
	TWhen extends HydrationWhen = HydrationWhen,
	TCanPrefetch extends boolean = boolean,
> = {
	when: TWhen;
	canPrefetch: TCanPrefetch;
};

/**
 * An SSR-safe description of when a deferred boundary should hydrate.
 *
 * The underscored members form Octane's runtime contract. Creating a strategy
 * never reads browser globals; the runtime invokes its setup function only on
 * the client.
 */
export type HydrationStrategy<
	TWhen extends HydrationWhen = HydrationWhen,
	TCanPrefetch extends boolean = boolean,
> = {
	/** Runtime discriminant; required so arbitrary objects cannot masquerade as strategies. */
	_t: TWhen;
	readonly '~types'?: HydrationStrategyTypes<TWhen, TCanPrefetch>;
	_d?: () => boolean;
	_s?: (context: HydrationRuntimeContext) => void | (() => void);
	_o?: (id: string) => void;
	_a?: () => HydrationMarkerAttributes | undefined;
};

export type HydrationPrefetchWhen = Exclude<HydrationWhen, 'condition' | 'never' | 'dynamic'>;

export type HydrationPrefetchStrategy<TWhen extends HydrationPrefetchWhen = HydrationPrefetchWhen> =
	HydrationStrategy<TWhen, true>;

export type HydrationPrefetchWaitReason = 'prefetch' | 'hydrate' | 'abort';

export type HydrationPrefetchContext = {
	element: Element | null;
	signal: AbortSignal;
	preload: () => Promise<void>;
	waitFor: (strategy: HydrationPrefetchStrategy) => Promise<HydrationPrefetchWaitReason>;
};

export type HydrationPrefetchFunction = (context: HydrationPrefetchContext) => void | Promise<void>;

export type HydrateWhen = HydrationStrategy | (() => HydrationStrategy);

type HydrateCommonOptions = {
	when: HydrateWhen;
	fallback?: unknown;
	onHydrated?: () => void;
};

/**
 * Options shared by the public `Hydrate` component.
 *
 * Strategy prefetching requires compiler splitting because it exists to fetch
 * that split child. Procedural prefetching is also useful without splitting,
 * so it remains valid with either value of `split`.
 */
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
	children: unknown;
};
