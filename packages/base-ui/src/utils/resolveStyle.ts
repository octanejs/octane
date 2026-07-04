// Ported from .base-ui/packages/react/src/utils/resolveStyle.ts.
// A style that is a function is called with the component state.
type CSSProperties = Record<string, any>;

export function resolveStyle<State>(
	style: CSSProperties | ((state: State) => CSSProperties | undefined) | undefined,
	state: State,
): CSSProperties | undefined {
	return typeof style === 'function' ? style(state) : style;
}
