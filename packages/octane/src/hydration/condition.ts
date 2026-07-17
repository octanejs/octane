import type { HydrationStrategy } from './types.js';

const conditionType = 'condition';

export type HydrationCondition = boolean | (() => boolean);

/* @__NO_SIDE_EFFECTS__ */
export function condition(
	conditionValue: HydrationCondition,
): HydrationStrategy<typeof conditionType, false> {
	const read = () => (typeof conditionValue === 'function' ? conditionValue() : conditionValue);

	return {
		_t: conditionType,
		_d: () => !read(),
		_s: ({ gate }) => {
			if (read()) gate?.resolve();
		},
	};
}
