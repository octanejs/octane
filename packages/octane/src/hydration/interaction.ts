import type { HydrationInteractionEvents, HydrationPrefetchStrategy } from './types.js';
import {
	HYDRATE_DEFAULT_INTERACTION_EVENTS,
	HYDRATE_INTERACTION_EVENTS_ATTR,
} from './interaction-config.js';

const interactionType = 'interaction';

export type InteractionHydrationOptions = {
	events?: HydrationInteractionEvents;
};

/* @__NO_SIDE_EFFECTS__ */
export function interaction(
	options: InteractionHydrationOptions = {},
): HydrationPrefetchStrategy<typeof interactionType> {
	let events: ReadonlyArray<string> = HYDRATE_DEFAULT_INTERACTION_EVENTS;
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
			options.events === undefined ? undefined : { [HYDRATE_INTERACTION_EVENTS_ATTR]: eventKey },
	};
}
