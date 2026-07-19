// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Modal.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement` (multi-child elements use the
// positional-children form); NO forwardRef — the forwarded ref is `props.ref`, passed into
// `useContextProps` (ModalOverlay) or forwarded as ModalContent's `modalRef` (Modal); the
// plain-`.ts` components use the S()/subSlot component-slot convention; react-aria private
// imports (animation, isScrollable, useViewportSize) come from the binding's ported modules;
// the dev-only misuse console.warns keep their upstream NODE_ENV guards.
import type { RefObject as SharedRefObject } from '@react-types/shared';
import { createContext, createElement, useContext, useMemo, useRef } from 'octane';

import { type AriaModalOverlayProps, useModalOverlay } from '../overlays/useModalOverlay';
import { DismissButton } from '../overlays/DismissButton';
import { S, subSlot } from '../internal';
import { filterDOMProps } from '../utils/filterDOMProps';
import { isScrollable } from '../utils/isScrollable';
import { mergeProps } from '../utils/mergeProps';
import { mergeRefs } from '../utils/mergeRefs';
import { Overlay } from '../overlays/Overlay';
import {
	type OverlayTriggerProps,
	type OverlayTriggerState,
	useOverlayTriggerState,
} from '../stately/overlays/useOverlayTriggerState';
import { OverlayTriggerStateContext } from './Dialog';
import { useEnterAnimation, useExitAnimation } from '../utils/animation';
import { useIsSSR } from '../ssr/SSRProvider';
import { useObjectRef } from '../utils/useObjectRef';
import { useViewportSize } from '../utils/useViewportSize';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	Provider,
	type RenderProps,
	type SlotProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptations: structural aliases for the React types upstream drags along.
type GlobalDOMAttributes = Record<string, any>;
type DOMAttributes = Record<string, any>;
type RefObject<T> = SharedRefObject<T>;
type ForwardedRef<T> = any;

export interface ModalOverlayProps
	extends
		AriaModalOverlayProps,
		OverlayTriggerProps,
		RenderProps<ModalRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-ModalOverlay'
	 */
	className?: ClassNameOrFunction<ModalRenderProps>;
	/**
	 * Whether the modal is currently performing an entry animation.
	 */
	isEntering?: boolean;
	/**
	 * Whether the modal is currently performing an exit animation.
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
}

interface InternalModalContextValue {
	modalProps: DOMAttributes;
	modalRef: RefObject<HTMLDivElement | null>;
	isExiting: boolean;
	isDismissable?: boolean;
}

export const ModalContext = createContext<ContextValue<ModalOverlayProps, HTMLDivElement>>(null);
const InternalModalContext = createContext<InternalModalContextValue | null>(null);

export interface ModalRenderProps {
	/**
	 * Whether the modal is currently entering. Use this to apply animations.
	 *
	 * @selector [data-entering]
	 */
	isEntering: boolean;
	/**
	 * Whether the modal is currently exiting. Use this to apply animations.
	 *
	 * @selector [data-exiting]
	 */
	isExiting: boolean;
	/**
	 * State of the modal.
	 */
	state: OverlayTriggerState;
}

/**
 * A modal is an overlay element which blocks interaction with elements outside it.
 */
export function Modal(allProps: ModalOverlayProps): any {
	let { ref, ...props } = allProps as ModalOverlayProps & { ref?: ForwardedRef<HTMLDivElement> };
	let ctx = useContext(InternalModalContext);

	if (ctx) {
		if (
			process.env.NODE_ENV !== 'production' &&
			(props.onOpenChange || props.defaultOpen !== undefined || props.isOpen !== undefined)
		) {
			// create a list of props that are passed in but not allowed when using an external ModalOverlay
			const invalidSet = new Set([
				'isDismissable',
				'isKeyboardDismissDisabled',
				'isOpen',
				'defaultOpen',
				'onOpenChange',
				'isEntering',
				'isExiting',
				'UNSTABLE_portalContainer',
				'shouldCloseOnInteractOutside',
			]);
			const invalidProps = Object.keys(props).filter((key) => invalidSet.has(key));
			console.warn(
				`This modal is already wrapped in a ModalOverlay, props [${invalidProps.join(', ')}] should be placed on the ModalOverlay instead.`,
			);
		}
		return createElement(ModalContent, {
			...props,
			modalRef: ref,
			children: props.children,
		});
	}

	let {
		isDismissable,
		isKeyboardDismissDisabled,
		isOpen,
		defaultOpen,
		onOpenChange,
		children,
		isEntering,
		isExiting,
		UNSTABLE_portalContainer,
		shouldCloseOnInteractOutside,
		...otherProps
	} = props;

	return createElement(ModalOverlay, {
		isDismissable,
		isKeyboardDismissDisabled,
		isOpen,
		defaultOpen,
		onOpenChange,
		isEntering,
		isExiting,
		UNSTABLE_portalContainer,
		shouldCloseOnInteractOutside,
		children: createElement(ModalContent, {
			...otherProps,
			modalRef: ref,
			children,
		}),
	});
}

interface ModalOverlayInnerProps extends ModalOverlayProps {
	overlayRef: RefObject<HTMLDivElement | null>;
	modalRef: RefObject<HTMLDivElement | null>;
	state: OverlayTriggerState;
	isExiting: boolean;
}

/**
 * A ModalOverlay is a wrapper for a Modal which allows customizing the backdrop element.
 */
export function ModalOverlay(props: ModalOverlayProps): any {
	const slot = S('ModalOverlay');
	let ref: any;
	[props, ref] = useContextProps(props, (props as any).ref, ModalContext, subSlot(slot, 'ctx'));
	let contextState = useContext(OverlayTriggerStateContext);
	let localState = useOverlayTriggerState(props, subSlot(slot, 'state'));
	let state =
		props.isOpen != null || props.defaultOpen != null || !contextState ? localState : contextState;
	if (state === contextState) {
		if (
			process.env.NODE_ENV !== 'production' &&
			(props.onOpenChange || props.defaultOpen !== undefined || props.isOpen !== undefined)
		) {
			console.warn(
				'This modals state is controlled by a trigger, place onOpenChange on the trigger instead.',
			);
		}
	}

	let objectRef = useObjectRef<HTMLDivElement>(ref, subSlot(slot, 'objectRef'));
	let modalRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'modalRef'));
	let isOverlayExiting = useExitAnimation(objectRef, state.isOpen, subSlot(slot, 'overlayExit'));
	let isModalExiting = useExitAnimation(modalRef, state.isOpen, subSlot(slot, 'modalExit'));
	let isExiting = isOverlayExiting || isModalExiting || props.isExiting || false;
	let isSSR = useIsSSR(subSlot(slot, 'ssr'));

	if ((!state.isOpen && !isExiting) || isSSR) {
		return null;
	}

	return createElement(ModalOverlayInner, {
		...props,
		state,
		isExiting,
		overlayRef: objectRef,
		modalRef,
	});
}

function ModalOverlayInner(allProps: ModalOverlayInnerProps): any {
	const slot = S('ModalOverlayInner');
	let { UNSTABLE_portalContainer, ...props } = allProps;
	let modalRef = props.modalRef;
	let { state } = props;
	let { modalProps, underlayProps } = useModalOverlay(
		props,
		state,
		modalRef,
		subSlot(slot, 'modalOverlay'),
	);

	let entering =
		useEnterAnimation(props.overlayRef, undefined, subSlot(slot, 'enter')) ||
		props.isEntering ||
		false;
	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-ModalOverlay',
			values: {
				isEntering: entering,
				isExiting: props.isExiting,
				state,
			},
		},
		subSlot(slot, 'render'),
	);

	let viewport = useViewportSize(subSlot(slot, 'viewport'));
	let pageWidth: number | undefined = undefined;
	let pageHeight: number | undefined = undefined;
	if (typeof document !== 'undefined') {
		let scrollingElement = isScrollable(document.body)
			? document.body
			: document.scrollingElement || document.documentElement;
		// Prevent Firefox from adding scrollbars when the page has a fractional width/height.
		let fractionalWidthDifference = scrollingElement.getBoundingClientRect().width % 1;
		let fractionalHeightDifference = scrollingElement.getBoundingClientRect().height % 1;
		pageWidth = scrollingElement.scrollWidth - fractionalWidthDifference;
		pageHeight = scrollingElement.scrollHeight - fractionalHeightDifference;
	}

	let style = {
		...renderProps.style,
		'--visual-viewport-width': viewport.width + 'px',
		'--visual-viewport-height': viewport.height + 'px',
		'--page-width': pageWidth !== undefined ? pageWidth + 'px' : undefined,
		'--page-height': pageHeight !== undefined ? pageHeight + 'px' : undefined,
	};

	return createElement(Overlay, {
		isExiting: props.isExiting,
		portalContainer: UNSTABLE_portalContainer,
		children: createElement(dom.div, {
			...mergeProps(filterDOMProps(props, { global: true }), underlayProps),
			...renderProps,
			style,
			ref: props.overlayRef,
			'data-entering': entering || undefined,
			'data-exiting': props.isExiting || undefined,
			children: createElement(Provider, {
				values: [
					[
						InternalModalContext,
						{
							modalProps,
							modalRef,
							isExiting: props.isExiting,
							isDismissable: props.isDismissable,
						},
					],
					[OverlayTriggerStateContext, state],
				] as any,
				children: renderProps.children,
			}),
		}),
	});
}

interface ModalContentProps extends RenderProps<ModalRenderProps>, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-ModalContent'
	 */
	className?: ClassNameOrFunction<ModalRenderProps>;
	modalRef: ForwardedRef<HTMLDivElement>;
}

function ModalContent(props: ModalContentProps): any {
	const slot = S('ModalContent');
	let { modalProps, modalRef, isExiting, isDismissable } = useContext(InternalModalContext)!;
	let state = useContext(OverlayTriggerStateContext)!;
	let mergedRefs = useMemo(
		() => mergeRefs(props.modalRef, modalRef),
		[props.modalRef, modalRef],
		subSlot(slot, 'mergedRefs'),
	);

	let ref = useObjectRef(mergedRefs, subSlot(slot, 'ref'));
	let entering = useEnterAnimation(ref, undefined, subSlot(slot, 'enter'));
	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-Modal',
			values: {
				isEntering: entering,
				isExiting,
				state,
			},
		},
		subSlot(slot, 'render'),
	);

	return createElement(
		dom.div,
		{
			...mergeProps(filterDOMProps(props, { global: true }), modalProps),
			...renderProps,
			ref,
			'data-entering': entering || undefined,
			'data-exiting': isExiting || undefined,
		},
		isDismissable ? createElement(DismissButton, { onDismiss: state.close }) : null,
		renderProps.children,
	);
}
