// Ported from react-spring v10.1.2 packages/core/src/AnimationResult.ts.
export interface AnimationResult<T> {
	value: T;
	finished: boolean;
	cancelled: boolean;
	noop?: boolean;
}

export function getFinishedResult<T>(value: T, finished: boolean): AnimationResult<T> {
	return { value, finished, cancelled: false };
}

export function getCancelledResult<T>(value: T): AnimationResult<T> {
	return { value, finished: false, cancelled: true };
}

export function getNoopResult<T>(value: T): AnimationResult<T> {
	return { value, finished: true, cancelled: false, noop: true };
}
