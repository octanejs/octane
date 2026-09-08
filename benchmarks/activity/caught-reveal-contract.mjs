export const CAUGHT_REVEAL_SMALL_COUNT = 512;
export const CAUGHT_REVEAL_LARGE_COUNT = CAUGHT_REVEAL_SMALL_COUNT * 8;

const INDICES = Object.freeze(
	Array.from({ length: CAUGHT_REVEAL_LARGE_COUNT }, (_, index) => index),
);

export const CAUGHT_REVEAL_SMALL_INDICES = Object.freeze(
	INDICES.slice(0, CAUGHT_REVEAL_SMALL_COUNT),
);
export const CAUGHT_REVEAL_LARGE_INDICES = INDICES;
