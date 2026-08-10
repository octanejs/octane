// React-free async sequencing primitive adapted from react-spring v10.1.2 packages/core/src/runAsync.ts.
import type { AnimationResult } from './AnimationResult';

export async function runAsync<State, Update>(
	script: (next: (update: Update) => Promise<AnimationResult<State>>) => Promise<void> | void,
	next: (update: Update) => Promise<AnimationResult<State>>,
	getValue: () => State,
): Promise<AnimationResult<State>> {
	let result: AnimationResult<State> = {
		value: getValue(),
		finished: true,
		cancelled: false,
		noop: true,
	};
	await script(async (update) => (result = await next(update)));
	return { ...result, value: getValue() };
}
