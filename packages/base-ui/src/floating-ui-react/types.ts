import type { HTMLProps } from '../types';
import type {
	UsePositionFloatingOptions as UsePositionOptions,
	UsePositionFloatingReturn,
	VirtualElement,
} from '@octanejs/floating-ui';
import type * as React from 'octane';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails';

import type { FloatingTreeStore } from './components/FloatingTreeStore';
import type { FloatingRootStore } from './components/FloatingRootStore';

export * from '.';
export type { FloatingDelayGroupProps } from './components/FloatingDelayGroup.tsrx';
export type { FloatingFocusManagerProps } from './components/FloatingFocusManager.tsrx';
export type { UseFloatingPortalNodeProps } from './components/FloatingPortal.tsrx';
export type { UseClientPointProps } from './hooks/useClientPoint';
export type { UseDismissProps } from './hooks/useDismiss';
export type { UseFocusProps } from './hooks/useFocus';
export type { UseHoverProps } from './hooks/useHover';
export type { HandleCloseContext, HandleClose } from './hooks/useHoverShared';
export type { UseHoverFloatingInteractionProps } from './hooks/useHoverFloatingInteraction';
export type { UseHoverReferenceInteractionProps } from './hooks/useHoverReferenceInteraction';
export type { UseListNavigationProps } from './hooks/useListNavigation';
export type { UseTypeaheadProps } from './hooks/useTypeahead';
export type { UseFloatingRootContextOptions } from './hooks/useFloatingRootContext';
export type { SafePolygonOptions } from './safePolygon';
export type { FloatingTreeProps, FloatingNodeProps } from './components/FloatingTree.tsrx';
export type {
	AlignedPlacement,
	Alignment,
	ArrowOptions,
	AutoPlacementOptions,
	AutoUpdateOptions,
	Axis,
	Boundary,
	ClientRectObject,
	ComputePositionConfig,
	ComputePositionReturn,
	Coords,
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
} from '@octanejs/floating-ui';
export {
	arrow,
	autoUpdate,
	computePosition,
	detectOverflow,
	getOverflowAncestors,
	limitShift,
	platform,
} from '@octanejs/floating-ui';

type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

export type Delay = number | Partial<{ open: number; close: number }>;

export type NarrowedElement<T> = T extends Element ? T : Element;

export interface ExtendedRefs {
	reference: React.RefObject<ReferenceType | null>;
	floating: React.RefObject<HTMLElement | null>;
	domReference: React.RefObject<NarrowedElement<ReferenceType> | null>;
	setReference(node: ReferenceType | null): void;
	setFloating(node: HTMLElement | null): void;
	setPositionReference(node: ReferenceType | null): void;
}

export interface ExtendedElements {
	reference: ReferenceType | null;
	floating: HTMLElement | null;
	domReference: NarrowedElement<ReferenceType> | null;
}

export interface FloatingEvents {
	emit<T extends string>(event: T, data?: any): void;
	on(event: string, handler: (data: any) => void): void;
	off(event: string, handler: (data: any) => void): void;
}

export interface ContextData {
	openEvent?: Event | undefined;
	floatingContext?: FloatingContext | undefined;
	[key: string]: any;
}

export type FloatingRootContext = FloatingRootStore;

export type FloatingContext = Omit<
	UsePositionFloatingReturn<ReferenceType>,
	'refs' | 'elements'
> & {
	open: boolean;
	onOpenChange(open: boolean, eventDetails: BaseUIChangeEventDetails<string>): void;
	events: FloatingEvents;
	dataRef: React.RefObject<ContextData>;
	nodeId: string | undefined;
	floatingId: string | undefined;
	refs: ExtendedRefs;
	elements: ExtendedElements;
	rootStore: FloatingRootContext;
};

export interface FloatingNodeType {
	id: string | undefined;
	parentId: string | null;
	context?: FloatingContext | undefined;
}

export type FloatingTreeType = FloatingTreeStore;

type InteractionProps<T extends Element> = {
	[Key in keyof HTMLProps<T>]: NonNullable<HTMLProps<T>[Key]> extends (event: infer E) => void
		? E extends Event
			? React.EventHandler<E> | Extract<HTMLProps<T>[Key], undefined>
			: HTMLProps<T>[Key]
		: HTMLProps<T>[Key];
};

export interface ElementProps {
	reference?: InteractionProps<Element> | undefined;
	floating?: InteractionProps<HTMLElement> | undefined;
	item?: InteractionProps<HTMLElement> | undefined;
	trigger?: InteractionProps<Element> | undefined;
}

export type ReferenceType = Element | VirtualElement;

export type UseFloatingData = Prettify<UseFloatingReturn>;

export type UseFloatingReturn = Prettify<
	UsePositionFloatingReturn & {
		/**
		 * `FloatingContext`
		 */
		context: Prettify<FloatingContext>;
		/**
		 * Object containing the reference and floating refs and reactive setters.
		 */
		refs: ExtendedRefs;
		elements: ExtendedElements;
	}
>;

export interface UseFloatingOptions extends Omit<UsePositionOptions, 'elements'> {
	rootContext?: FloatingRootContext | undefined;
	/**
	 * Object of external elements as an alternative to the `refs` object setters.
	 */
	elements?:
		| {
				/**
				 * Externally passed reference element. Store in state.
				 */
				reference?: ReferenceType | null | undefined;
				/**
				 * Externally passed floating element. Store in state.
				 */
				floating?: HTMLElement | null | undefined;
		  }
		| undefined;
	/**
	 * An event callback that is invoked when the floating element is opened or
	 * closed.
	 */
	onOpenChange?(open: boolean, eventDetails: BaseUIChangeEventDetails<string>): void;
	/**
	 * Unique node id when using `FloatingTree`.
	 */
	nodeId?: string | undefined;
	/**
	 * External FloatingTree to use when the one provided by context can't be used.
	 */
	externalTree?: FloatingTreeStore | undefined;
}

export { autoPlacement, flip, hide, inline, offset, shift, size } from './middleware/positioning';
