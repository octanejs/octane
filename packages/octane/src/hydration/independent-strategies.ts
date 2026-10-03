import {
	HYDRATE_IDLE_TIMEOUT_ATTR,
	HYDRATE_MEDIA_ATTR,
	HYDRATE_VISIBLE_MARGIN_ATTR,
	HYDRATE_VISIBLE_THRESHOLD_ATTR,
} from './strategy-attributes.js';
import { idle } from './idle.js';
import type { IndependentHydrateStrategies } from './independent-island.js';
import { media } from './media.js';
import { visible } from './visible.js';

/**
 * Rebuild the built-in automatic strategy the server serialized for an
 * independent boundary. The lexical parent that evaluated `when` never runs
 * here, so the server encodes each strategy's `_p` parameters on the wrapper.
 *
 * This module is separate from the bootstrap so a page whose islands use only
 * `load()` and `interaction()` never ships these strategies. Passing it as the
 * bootstrap's `strategies` option arms triggers during registration; otherwise
 * an island that needs one loads this module on demand.
 */
export const independentHydrationStrategies: IndependentHydrateStrategies = {
	idle(element) {
		const timeout = element.getAttribute(HYDRATE_IDLE_TIMEOUT_ATTR);
		return idle(timeout === null ? {} : { timeout: Number(timeout) });
	},
	visible(element) {
		const rootMargin = element.getAttribute(HYDRATE_VISIBLE_MARGIN_ATTR);
		const threshold = element.getAttribute(HYDRATE_VISIBLE_THRESHOLD_ATTR);
		return visible({
			...(rootMargin === null ? {} : { rootMargin }),
			...(threshold === null ? {} : { threshold: threshold.split(',').map(Number) }),
		});
	},
	media: (element) => media(element.getAttribute(HYDRATE_MEDIA_ATTR) ?? ''),
};
