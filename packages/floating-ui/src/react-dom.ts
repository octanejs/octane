import * as dom from '@floating-ui/dom';
import type { ComputePositionConfig } from '@floating-ui/dom';
import type { CSSProperties } from 'octane/jsx-runtime';
import { arrow as refArrow } from './useFloating';
import type { ReferenceType, UsePositionFloatingReturn } from './types';

export {
	autoUpdate,
	computePosition,
	detectOverflow,
	getOverflowAncestors,
	platform,
} from '@floating-ui/dom';
export { useFloating } from './useFloating';
export type {
	ArrowOptions,
	ReferenceType,
	UsePositionFloatingData as UseFloatingData,
} from './types';
export type {
	AlignedPlacement,
	Alignment,
	AutoPlacementOptions,
	AutoUpdateOptions,
	Axis,
	Boundary,
	ClientRectObject,
	ComputePositionConfig,
	ComputePositionReturn,
	Coords,
	Derivable,
	DetectOverflowOptions,
	Dimensions,
	ElementContext,
	ElementRects,
	Elements,
	FlipOptions,
	FloatingElement,
	HideOptions,
	InlineOptions,
	Length,
	Middleware,
	MiddlewareArguments,
	MiddlewareData,
	MiddlewareReturn,
	MiddlewareState,
	NodeScroll,
	OffsetOptions,
	Padding,
	Placement,
	Platform,
	Rect,
	ReferenceElement,
	RootBoundary,
	ShiftOptions,
	Side,
	SideObject,
	SizeOptions,
	Strategy,
	VirtualElement,
} from '@floating-ui/dom';

export type UseFloatingOptions<RT extends ReferenceType = ReferenceType> =
	Partial<ComputePositionConfig> & {
		whileElementsMounted?:
			((reference: RT, floating: HTMLElement, update: () => void) => () => void) | undefined;
		elements?:
			{ reference?: RT | null | undefined; floating?: HTMLElement | null | undefined } | undefined;
		open?: boolean | undefined;
		transform?: boolean | undefined;
	};

export type UseFloatingReturn<RT extends ReferenceType = ReferenceType> = Omit<
	UsePositionFloatingReturn<RT>,
	'floatingStyles'
> & { floatingStyles: CSSProperties };

type Dependencies = readonly unknown[];
type Reactive<F extends (...args: never[]) => unknown> = (
	...args: [...Parameters<F>, deps?: Dependencies]
) => ReturnType<F>;

// Upstream compares the dependency list alongside options that capture a closure.
function metadata(result: dom.Middleware, options: unknown, deps?: Dependencies): dom.Middleware {
	return { name: result.name, fn: result.fn, options: [options, deps] };
}

export const arrow: Reactive<typeof refArrow> = (options, deps) =>
	metadata(refArrow(options), options, deps);
export const autoPlacement: Reactive<typeof dom.autoPlacement> = (options, deps) =>
	metadata(dom.autoPlacement(options), options, deps);
export const flip: Reactive<typeof dom.flip> = (options, deps) =>
	metadata(dom.flip(options), options, deps);
export const hide: Reactive<typeof dom.hide> = (options, deps) =>
	metadata(dom.hide(options), options, deps);
export const inline: Reactive<typeof dom.inline> = (options, deps) =>
	metadata(dom.inline(options), options, deps);
export const limitShift: Reactive<typeof dom.limitShift> = (options, deps) => ({
	fn: dom.limitShift(options).fn,
	options: [options, deps],
});
export const offset: Reactive<typeof dom.offset> = (options, deps) =>
	metadata(dom.offset(options), options, deps);
export const shift: Reactive<typeof dom.shift> = (options, deps) =>
	metadata(dom.shift(options), options, deps);
export const size: Reactive<typeof dom.size> = (options, deps) =>
	metadata(dom.size(options), options, deps);
