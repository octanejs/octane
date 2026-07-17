import {
	condition,
	idle,
	interaction,
	load,
	media,
	never,
	visible,
	type HydrateOptions,
	type HydrationPrefetchContext,
	type HydrationPrefetchFunction,
	type HydrationStrategy,
} from 'octane/hydration';
import type {
	HydrateOptions as RootHydrateOptions,
	HydrationPrefetchContext as RootHydrationPrefetchContext,
} from 'octane';

export const rootOptions: RootHydrateOptions = { when: load() };
export const rootContext: RootHydrationPrefetchContext | undefined = undefined;

export const strategies: Array<HydrationStrategy> = [
	load(),
	idle(),
	visible(),
	media('(min-width: 48rem)'),
	interaction(),
	condition(true),
	never(),
];

export const dynamicWhen = {
	when: () => visible({ rootMargin: '100px', threshold: [0, 0.5, 1] }),
	split: false,
} satisfies HydrateOptions;

// @ts-expect-error — an arbitrary object is not a hydration strategy
export const missingStrategyType: HydrateOptions = { when: {} };

// @ts-expect-error — function-form when must return a strategy synchronously
export const asynchronousWhen: HydrateOptions = { when: async () => visible() };

// @ts-expect-error — when is required
export const missingWhen: HydrateOptions = {};

export const strategyPrefetch = {
	when: interaction({ events: ['pointerdown', 'keydown'] }),
	prefetch: idle({ timeout: 500 }),
	split: true,
} satisfies HydrateOptions;

// @ts-expect-error — strategy prefetching requires a compiler-split child
export const unsplitStrategyPrefetch: HydrateOptions = {
	when: visible(),
	prefetch: idle(),
	split: false,
};

export const proceduralPrefetch: HydrationPrefetchFunction = async ({
	element,
	preload,
	signal,
	waitFor,
}: HydrationPrefetchContext) => {
	void element;
	if (signal.aborted) return;
	await preload();
	const reason: 'prefetch' | 'hydrate' | 'abort' = await waitFor(visible());
	void reason;
};

export const unsplitProceduralPrefetch = {
	when: condition(() => true),
	prefetch: proceduralPrefetch,
	split: false,
} satisfies HydrateOptions;

interaction({ events: 'click' });
interaction({ events: ['focusin', 'keyup'] });
// @ts-expect-error — only replay-safe intent events are supported
interaction({ events: 'input' });

idle({ timeout: 0 });
visible({ rootMargin: '600px', threshold: 0.25 });
// @ts-expect-error — visible thresholds are numeric
visible({ threshold: 'half' });
