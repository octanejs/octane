import type { HydrationInteractionEvents, HydrationPrefetchStrategy } from './types.js';

const interactionType = 'interaction';
const interactionEventsAttribute = 'data-octane-hydrate-interaction-events';

const defaultInteractionEvents = ['pointerenter', 'focusin', 'pointerdown', 'click'] as const;

export type InteractionHydrationOptions = {
	events?: HydrationInteractionEvents;
};

/* @__NO_SIDE_EFFECTS__ */
export function interaction(
	options: InteractionHydrationOptions = {},
): HydrationPrefetchStrategy<typeof interactionType> {
	let events: ReadonlyArray<string> = defaultInteractionEvents;
	if (options.events !== undefined) {
		const input = typeof options.events === 'string' ? [options.events] : options.events;
		events = [...new Set(input.filter(Boolean))];
	}
	const eventKey = events.join(' ');

	return {
		_t: interactionType,
		_s: ({ element, gate, prefetch }) => {
			if (!element || events.length === 0) return;
			const callback = prefetch ?? gate?.resolve;
			if (!callback) return;

			const onIntent = () => callback();
			for (const eventName of events) {
				element.addEventListener(eventName, onIntent, true);
			}

			return () => {
				for (const eventName of events) {
					element.removeEventListener(eventName, onIntent, true);
				}
			};
		},
		_a: () =>
			options.events === undefined ? undefined : { [interactionEventsAttribute]: eventKey },
	};
}
