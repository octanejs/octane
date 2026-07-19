// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Popover.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement` (multi-child elements use the
// positional-children form); NO forwardRef — the forwarded ref is `props.ref`, passed into
// `useContextProps` explicitly; the plain-`.ts` components use the S()/subSlot component-slot
// convention; the hidden-tree branch returns the children value directly (octane components
// may return any renderable, no Fragment wrapper needed); react-aria private imports come from
// the binding's ported modules; React's Context/element types → structural aliases.
import type { AriaLabelingProps, RefObject as SharedRefObject } from '@react-types/shared';
import {
	type Context,
	createContext,
	createElement,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { type AriaPopoverProps, usePopover } from '../overlays/usePopover';
import { DismissButton } from '../overlays/DismissButton';
import { focusSafely } from '../interactions/focusSafely';
import { getInteractionModality } from '../interactions/useFocusVisible';
import { S, subSlot } from '../internal';
import { isFocusWithin } from '../utils/shadowdom/DOMFunctions';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { Overlay } from '../overlays/Overlay';
import { OverlayArrowContext } from './OverlayArrow';
import {
	type OverlayTriggerProps,
	type OverlayTriggerState,
	useOverlayTriggerState,
} from '../stately/overlays/useOverlayTriggerState';
import { OverlayTriggerStateContext } from './Dialog';
import type { PlacementAxis, PositionProps } from '../overlays/useOverlayPosition';
import { useEnterAnimation, useExitAnimation } from '../utils/animation';
import { useIsHidden } from '../collections/Hidden';
import { useLayoutEffect } from '../utils/useLayoutEffect';
import { useLocale } from '../i18n/I18nProvider';
import { useResizeObserver } from '../utils/useResizeObserver';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	type RenderProps,
	type SlotProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;
type RefObject<T> = SharedRefObject<T>;

export interface PopoverProps
	extends
		Omit<PositionProps, 'isOpen'>,
		Omit<AriaPopoverProps, 'popoverRef' | 'triggerRef' | 'groupRef' | 'offset' | 'arrowSize'>,
		OverlayTriggerProps,
		RenderProps<PopoverRenderProps>,
		SlotProps,
		AriaLabelingProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Popover'
	 */
	className?: ClassNameOrFunction<PopoverRenderProps>;
	/**
	 * The name of the component that triggered the popover. This is reflected on the element
	 * as the `data-trigger` attribute, and can be used to provide specific
	 * styles for the popover depending on which element triggered it.
	 */
	trigger?: string;
	/**
	 * The ref for the element which the popover positions itself with respect to.
	 *
	 * When used within a trigger component such as DialogTrigger, MenuTrigger, Select, etc.,
	 * this is set automatically. It is only required when used standalone.
	 */
	triggerRef?: RefObject<Element | null>;
	/**
	 * Whether the popover is currently performing an entry animation.
	 */
	isEntering?: boolean;
	/**
	 * Whether the popover is currently performing an exit animation.
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
	 * The additional offset applied along the main axis between the element and its
	 * anchor element.
	 *
	 * @default 8
	 */
	offset?: number;
}

export interface PopoverRenderProps {
	/**
	 * The name of the component that triggered the popover, e.g. "DialogTrigger" or "ComboBox".
	 *
	 * @selector [data-trigger="..."]
	 */
	trigger: string | null;
	/**
	 * The placement of the popover relative to the trigger.
	 *
	 * @selector [data-placement="left | right | top | bottom"]
	 */
	placement: PlacementAxis | null;
	/**
	 * Whether the popover is currently entering. Use this to apply animations.
	 *
	 * @selector [data-entering]
	 */
	isEntering: boolean;
	/**
	 * Whether the popover is currently exiting. Use this to apply animations.
	 *
	 * @selector [data-exiting]
	 */
	isExiting: boolean;
}

interface PopoverContextValue extends PopoverProps {
	/** Contexts to clear. */
	clearContexts?: Context<any>[];
}

export const PopoverContext = createContext<ContextValue<PopoverContextValue, HTMLElement>>(null);

// Stores a ref for the portal container for a group of popovers (e.g. submenus).
const PopoverGroupContext = createContext<RefObject<Element | null> | null>(null);

/**
 * A popover is an overlay element positioned relative to a trigger.
 */
export function Popover(props: PopoverProps): any {
	const slot = S('Popover');
	let ref: any;
	[props, ref] = useContextProps(props, (props as any).ref, PopoverContext, subSlot(slot, 'ctx'));
	let contextState = useContext(OverlayTriggerStateContext);
	let localState = useOverlayTriggerState(props, subSlot(slot, 'state'));
	let state =
		props.isOpen != null || props.defaultOpen != null || !contextState ? localState : contextState;
	let isExiting =
		useExitAnimation(ref, state.isOpen, subSlot(slot, 'exit')) || props.isExiting || false;
	let isHidden = useIsHidden();
	let { direction } = useLocale(subSlot(slot, 'locale'));

	// If we are in a hidden tree, we still need to preserve our children.
	if (isHidden) {
		let children = props.children;
		if (typeof children === 'function') {
			children = children({
				trigger: props.trigger || null,
				placement: 'bottom',
				isEntering: false,
				isExiting: false,
				defaultChildren: null,
			});
		}

		return children;
	}

	if (state && !state.isOpen && !isExiting) {
		return null;
	}

	return createElement(PopoverInner, {
		...props,
		triggerRef: props.triggerRef!,
		state,
		popoverRef: ref,
		isExiting,
		dir: direction,
	});
}

interface PopoverInnerProps extends AriaPopoverProps, RenderProps<PopoverRenderProps>, SlotProps {
	state: OverlayTriggerState;
	isEntering?: boolean;
	isExiting: boolean;
	UNSTABLE_portalContainer?: Element;
	trigger?: string;
	dir?: 'ltr' | 'rtl';
	clearContexts?: Context<any>[];
}

function PopoverInner(allProps: PopoverInnerProps): any {
	const slot = S('PopoverInner');
	let { state, isExiting, UNSTABLE_portalContainer, clearContexts, ...props } =
		allProps as PopoverInnerProps & GlobalDOMAttributes;
	// Calculate the arrow size internally (and remove props.arrowSize from PopoverProps)
	// Referenced from: packages/@react-spectrum/tooltip/src/TooltipTrigger.tsx
	let arrowRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'arrowRef'));
	let containerRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'containerRef'));
	let groupCtx = useContext(PopoverGroupContext);
	let isSubPopover = groupCtx && props.trigger === 'SubmenuTrigger';

	let { popoverProps, underlayProps, arrowProps, placement, triggerAnchorPoint } = usePopover(
		{
			...props,
			offset: (props as any).offset ?? 8,
			arrowRef,
			// If this is a submenu/subdialog, use the root popover's container
			// to detect outside interaction and add aria-hidden.
			groupRef: isSubPopover ? groupCtx! : containerRef,
		},
		state,
		subSlot(slot, 'popover'),
	);

	let ref = props.popoverRef as RefObject<HTMLDivElement | null>;
	let isEntering =
		useEnterAnimation(ref, !!placement, subSlot(slot, 'enter')) || props.isEntering || false;
	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-Popover',
			values: {
				trigger: props.trigger || null,
				placement,
				isEntering,
				isExiting,
			},
		},
		subSlot(slot, 'render'),
	);

	// Automatically render Popover with role=dialog except when isNonModal is true,
	// or a dialog is already nested inside the popover.
	let shouldBeDialog = !props.isNonModal || props.trigger === 'SubmenuTrigger';
	let [isDialog, setDialog] = useState(false, subSlot(slot, 'isDialog'));
	useLayoutEffect(
		() => {
			if (ref.current) {
				setDialog(shouldBeDialog && !ref.current.querySelector('[role=dialog]'));
			}
		},
		[ref, shouldBeDialog],
		subSlot(slot, 'dialogCheck'),
	);

	// Focus the popover itself on mount, unless a child element is already focused.
	// Skip this for submenus since hovering a submenutrigger should keep focus on the trigger
	useEffect(
		() => {
			if (
				isDialog &&
				(props.trigger !== 'SubmenuTrigger' || getInteractionModality() !== 'pointer') &&
				ref.current &&
				!isFocusWithin(ref.current)
			) {
				focusSafely(ref.current);
			}
		},
		[isDialog, ref, props.trigger],
		subSlot(slot, 'autofocus'),
	);

	let children = useMemo(
		() => {
			let children = renderProps.children;
			if (clearContexts) {
				for (let Context of clearContexts) {
					children = createElement((Context as any).Provider, { value: null, children });
				}
			}
			return children;
		},
		[renderProps.children, clearContexts],
		subSlot(slot, 'children'),
	);

	let [triggerWidth, setTriggerWidth] = useState<string | null>(
		null,
		subSlot(slot, 'triggerWidth'),
	);
	let onResize = useCallback(
		() => {
			if (props.triggerRef.current) {
				setTriggerWidth(props.triggerRef.current.getBoundingClientRect().width + 'px');
			}
		},
		[props.triggerRef],
		subSlot(slot, 'onResize'),
	);

	useLayoutEffect(onResize, [onResize], subSlot(slot, 'resizeEffect'));
	useResizeObserver(
		{
			ref: renderProps.style?.['--trigger-width'] ? undefined : props.triggerRef,
			onResize: onResize,
		},
		subSlot(slot, 'resizeObserver'),
	);

	let style = {
		...popoverProps.style,
		'--trigger-anchor-point': triggerAnchorPoint
			? `${triggerAnchorPoint.x}px ${triggerAnchorPoint.y}px`
			: undefined,
		...renderProps.style,
		'--trigger-width': renderProps.style?.['--trigger-width'] || triggerWidth,
	};

	let overlay = createElement(
		dom.div,
		{
			...mergeProps(filterDOMProps(props, { global: true }), popoverProps),
			...renderProps,
			role: isDialog ? 'dialog' : undefined,
			tabIndex: isDialog ? -1 : undefined,
			'aria-label': props['aria-label'],
			'aria-labelledby': props['aria-labelledby'],
			ref,
			slot: props.slot || undefined,
			style,
			dir: props.dir,
			'data-trigger': props.trigger,
			'data-placement': placement,
			'data-entering': isEntering || undefined,
			'data-exiting': isExiting || undefined,
		},
		!props.isNonModal ? createElement(DismissButton, { onDismiss: state.close }) : null,
		createElement(OverlayArrowContext.Provider, {
			value: { ...arrowProps, placement, ref: arrowRef } as any,
			children,
		}),
		createElement(DismissButton, { onDismiss: state.close }),
	);

	// If this is a root popover, render an extra div to act as the portal container for submenus/subdialogs.
	if (!isSubPopover) {
		return createElement(
			Overlay,
			{
				...props,
				shouldContainFocus: isDialog,
				isExiting,
				portalContainer: UNSTABLE_portalContainer,
				// octane adaptation: children arrive positionally below.
			} as any,
			!props.isNonModal && state.isOpen
				? createElement('div', {
						'data-testid': 'underlay',
						...underlayProps,
						style: { position: 'fixed', inset: 0 },
					})
				: null,
			createElement('div', {
				ref: containerRef,
				style: { display: 'contents' },
				children: createElement(PopoverGroupContext.Provider, {
					value: containerRef,
					children: overlay,
				}),
			}),
		);
	}

	// Submenus/subdialogs are mounted into the root popover's container.
	return createElement(Overlay, {
		...props,
		shouldContainFocus: isDialog,
		isExiting,
		portalContainer: UNSTABLE_portalContainer ?? groupCtx?.current ?? undefined,
		children: overlay,
	});
}
