// Op driver.
//
// One clear of one list is well under a millisecond — below the runner's
// sub-millisecond regression floor, so a real strategy change could not be
// told from timer granularity. Each timed op therefore clears a GROUP of
// independent lists in a single commit, putting the sample comfortably over
// 1ms while every individual clear stays the size being measured.

import { buildItems } from './data.js';

// [shared lists x items each] — the small op exercises the small-list
// strategy, the large one the large-list strategy.
//
// The small op uses MANY SHORT lists rather than a few long ones on purpose.
// Everything a clear commit does besides removing DOM — the disposal pass,
// block bookkeeping, the state update — scales with total items, so it dilutes
// the strategy difference; the difference itself scales with the number of
// clears. Short lists buy roughly five times the signal per item of that
// overhead, and they are also the shape that actually shows up (a handful of
// nodes beside other JSX), so the op measures the difference it exists to
// guard instead of burying it under commit cost.
export const SHARED_SMALL = { groups: 150, items: 10 };
export const SHARED_LARGE = { groups: 3, items: 1000 };
export const OWNED_LARGE = { groups: 3, items: 1000 };

const setters = { sharedSmall: [], sharedLarge: [], owned: [] };

export function registerGroup(kind, setItems) {
	if (!setters[kind].includes(setItems)) setters[kind].push(setItems);
}

const fill = (kind, count) => {
	for (const set of setters[kind]) set(buildItems(count));
};
const clear = (kind) => {
	for (const set of setters[kind]) set([]);
};

export const fillSharedSmall = () => fill('sharedSmall', SHARED_SMALL.items);
export const fillSharedLarge = () => fill('sharedLarge', SHARED_LARGE.items);
export const fillOwned = () => fill('owned', OWNED_LARGE.items);
export const clearSharedSmall = () => clear('sharedSmall');
export const clearSharedLarge = () => clear('sharedLarge');
export const clearOwned = () => clear('owned');
