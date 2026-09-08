import {
	autoPlacement as baseAutoPlacement,
	flip as baseFlip,
	hide as baseHide,
	inline as baseInline,
	offset as baseOffset,
	shift as baseShift,
	size as baseSize,
	type Middleware,
} from '@octanejs/floating-ui';
import type { DependencyList } from 'octane';

// Positioning compares middleware options across renders. Keep explicit dependencies
// in that comparison even when a callback's source text is unchanged.
function withDependencies<Options>(factory: (options?: Options) => Middleware) {
	return (options?: Options, dependencies?: DependencyList): Middleware => {
		const middleware = factory(options);
		return { ...middleware, options: [options, dependencies] };
	};
}

export const autoPlacement = withDependencies(baseAutoPlacement);
export const flip = withDependencies(baseFlip);
export const hide = withDependencies(baseHide);
export const inline = withDependencies(baseInline);
export const offset = withDependencies(baseOffset);
export const shift = withDependencies(baseShift);
export const size = withDependencies(baseSize);
