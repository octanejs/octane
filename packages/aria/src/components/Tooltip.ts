// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Tooltip.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly; the plain-`.ts` components use the
// S()/subSlot component-slot convention; `OverlayContainer` comes from the binding's ported
// `../overlays/useModal`, `FocusableProvider` from `../interactions/useFocusable`, and the
// enter/exit animation hooks from `../utils/animation`; React's ReactNode/JSX/CSSProperties
// types → structural aliases.
import type {
	AriaLabelingProps,
	FocusableElement,
	RefObject as SharedRefObject,
} from '@react-types/shared';
import { createContext, createElement, useContext, useRef } from 'octane';

import {
	type AriaPositionProps,
	type Placement,
	type PlacementAxis,
	type PositionProps,
	useOverlayPosition,
} from '../overlays/useOverlayPosition';
import { S, subSlot } from '../internal';
import { filterDOMProps } from '../utils/filterDOMProps';
import { FocusableProvider } from '../interactions/useFocusable';
import { mergeProps } from '../utils/mergeProps';
import { OverlayArrowContext } from './OverlayArrow';
import { OverlayContainer } from '../overlays/useModal';
import type { OverlayTriggerProps } from '../stately/overlays/useOverlayTriggerState';
import {
	type TooltipTriggerProps,
	type TooltipTriggerState,
	useTooltipTriggerState,
} from '../stately/tooltip/useTooltipTriggerState';
import { useEnterAnimation, useExitAnimation } from '../utils/animation';
import { useTooltip } from '../tooltip/useTooltip';
import { useTooltipTrigger } from '../tooltip/useTooltipTrigger';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	Provider,
	type RenderProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptations: structural aliases for the React types upstream drags along.
type ReactNode = any;
type GlobalDOMAttributes = Record<string, any>;
type RefObject<T> = SharedRefObject<T>;

export interface TooltipTriggerComponentProps extends TooltipTriggerProps {
	children: ReactNode;
}

export interface TooltipProps
	extends
		PositionProps,
		Pick<AriaPositionProps, 'arrowBoundaryOffset'>,
		OverlayTriggerProps,
		AriaLabelingProps,
		RenderProps<TooltipRenderProps>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Tooltip'
	 */
	className?: ClassNameOrFunction<TooltipRenderProps>;
	/**
	 * The ref for the element which the tooltip positions itself with respect to.
	 *
	 * When used within a TooltipTrigger this is set automatically. It is only required when used
	 * standalone.
	 */
	triggerRef?: RefObject<Element | null>;
	/**
	 * Whether the tooltip is currently performing an entry animation.
	 */
	isEntering?: boolean;
	/**
	 * Whether the tooltip is currently performing an exit animation.
	 */
	isExiting?: boolean;
	/**
	 * The container element in which the overlay portal will be placed. This may have unknown
	 * behavior depending on where it is portalled to.
	 *
	 * @deprecated - Use a parent UNSAFE_PortalProvider to set your portal container instead.
	 * @default document.body
	 */
	UNSTABLE_portalContainer?: Element;
	/**
	 * The placement of the tooltip with respect to the trigger.
	 *
	 * @default 'top'
	 */
	placement?: Placement;
}

export interface TooltipRenderProps {
	/**
	 * The placement of the tooltip relative to the trigger.
	 *
	 * @selector [data-placement="left | right | top | bottom"]
	 */
	placement: PlacementAxis | null;
	/**
	 * Whether the tooltip is currently entering. Use this to apply animations.
	 *
	 * @selector [data-entering]
	 */
	isEntering: boolean;
	/**
	 * Whether the tooltip is currently exiting. Use this to apply animations.
	 *
	 * @selector [data-exiting]
	 */
	isExiting: boolean;
	/**
	 * State of the tooltip.
	 */
	state: TooltipTriggerState;
}

export const TooltipTriggerStateContext = createContext<TooltipTriggerState | null>(null);
export const TooltipContext = createContext<ContextValue<TooltipProps, HTMLDivElement>>(null);

/**
 * TooltipTrigger wraps around a trigger element and a Tooltip. It handles opening and closing
 * the Tooltip when the user hovers over or focuses the trigger, and positioning the Tooltip
 * relative to the trigger.
 */
export function TooltipTrigger(props: TooltipTriggerComponentProps): any {
	const slot = S('TooltipTrigger');
	let state = useTooltipTriggerState(props, subSlot(slot, 'state'));
	let ref = useRef<FocusableElement | null>(null, subSlot(slot, 'ref'));
	let { triggerProps, tooltipProps } = useTooltipTrigger(
		props,
		state,
		ref,
		subSlot(slot, 'trigger'),
	);

	return createElement(Provider, {
		values: [
			[TooltipTriggerStateContext, state],
			[TooltipContext, { ...tooltipProps, triggerRef: ref }],
		] as any,
		children: createElement(FocusableProvider, {
			...triggerProps,
			ref,
			children: props.children,
		}),
	});
}

/**
 * A tooltip displays a description of an element on hover or focus.
 */
export function Tooltip(allProps: TooltipProps): any {
	const slot = S('Tooltip');
	let { UNSTABLE_portalContainer, ...props } = allProps;
	let ref: any;
	[props, ref] = useContextProps(props, (props as any).ref, TooltipContext, subSlot(slot, 'ctx'));
	let contextState = useContext(TooltipTriggerStateContext);
	let localState = useTooltipTriggerState(props, subSlot(slot, 'state'));
	let state =
		props.isOpen != null || props.defaultOpen != null || !contextState ? localState : contextState;
	let isExiting =
		useExitAnimation(ref, state.isOpen, subSlot(slot, 'exit')) || props.isExiting || false;
	if (!state.isOpen && !isExiting) {
		return null;
	}

	return createElement(OverlayContainer, {
		portalContainer: UNSTABLE_portalContainer,
		children: createElement(TooltipInner, { ...props, tooltipRef: ref, isExiting }),
	});
}

function TooltipInner(
	allProps: TooltipProps & { isExiting: boolean; tooltipRef: RefObject<HTMLDivElement | null> },
): any {
	const slot = S('TooltipInner');
	let props: any = allProps;
	let state = useContext(TooltipTriggerStateContext)!;
	let arrowRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'arrowRef'));

	let { overlayProps, arrowProps, placement, triggerAnchorPoint } = useOverlayPosition(
		{
			placement: props.placement || 'top',
			targetRef: props.triggerRef!,
			overlayRef: props.tooltipRef,
			arrowRef,
			offset: props.offset,
			crossOffset: props.crossOffset,
			isOpen: state.isOpen,
			arrowBoundaryOffset: props.arrowBoundaryOffset,
			shouldFlip: props.shouldFlip,
			containerPadding: props.containerPadding,
			onClose: () => state.close(true),
		},
		subSlot(slot, 'position'),
	);

	let isEntering =
		useEnterAnimation(props.tooltipRef, !!placement, subSlot(slot, 'enter')) ||
		props.isEntering ||
		false;
	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-Tooltip',
			values: {
				placement,
				isEntering,
				isExiting: props.isExiting,
				state,
			},
		},
		subSlot(slot, 'render'),
	);

	props = mergeProps(props, overlayProps);
	let { tooltipProps } = useTooltip(props, state, subSlot(slot, 'tooltip'));

	let DOMProps = filterDOMProps(props, { global: true });

	return createElement(dom.div, {
		...mergeProps(DOMProps, renderProps, tooltipProps),
		ref: props.tooltipRef,
		style: {
			...overlayProps.style,
			'--trigger-anchor-point': triggerAnchorPoint
				? `${triggerAnchorPoint.x}px ${triggerAnchorPoint.y}px`
				: undefined,
			...renderProps.style,
		},
		'data-placement': placement ?? undefined,
		'data-entering': isEntering || undefined,
		'data-exiting': props.isExiting || undefined,
		children: createElement(OverlayArrowContext.Provider, {
			value: { ...arrowProps, placement, ref: arrowRef } as any,
			children: renderProps.children,
		}),
	});
}
