// Ported from .base-ui/packages/react/src/utils/resolveClassName.ts.
// A className that is a function is called with the component state.
export function resolveClassName<State>(
	className: string | ((state: State) => string | undefined) | undefined,
	state: State,
): string | undefined {
	return typeof className === 'function' ? className(state) : className;
}
