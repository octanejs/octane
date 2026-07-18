// Shared public types for @octanejs/floating-ui — the octane adaptation of
// @floating-ui/react's (0.27.19) type surface. Names and shapes mirror upstream;
// React idioms map to the port's actual contract:
//
//  - `React.MutableRefObject<T>` → octane's plain mutable ref object
//    (`MutableRefObject<T>` below — `{ current: T }`, what octane's useRef
//    returns). Ref callbacks are `(node: T | null) => void` with an optional
//    React-19-style cleanup return.
//  - `React.SetStateAction` / `Dispatch` → octane's useState setter shape
//    (`(value: T | ((prev: T) => T)) => void`).
//  - `React.HTMLProps<T>` prop bags → `HTMLProps<T>`: octane's JSX attribute
//    surface (`Octane.HTMLAttributes` — NATIVE event handlers, no synthetic
//    layer) plus an open string index, because the interaction prop getters
//    merge arbitrary keys (aria-*, data-*, ref).
//  - `whileElementsMounted` may return `void` as well as a cleanup — the port
//    forwards its result straight to an octane effect, which accepts both.
import type { Octane } from 'octane/jsx-runtime';
import type {
	ComputePositionConfig,
	ComputePositionReturn,
	Padding,
	Strategy,
	VirtualElement,
} from '@floating-ui/dom';

type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

export type ReferenceType = Element | VirtualElement;

export type NarrowedElement<T> = T extends Element ? T : Element;

/** Octane ref-object shape (what octane's `useRef` returns). */
export interface MutableRefObject<T> {
	current: T;
}

/** Octane ref callback (React-19 style: may return a cleanup). */
export type RefCallback<T> = (node: T | null) => void | (() => void);

export type OpenChangeReason =
	| 'outside-press'
	| 'escape-key'
	| 'ancestor-scroll'
	| 'reference-press'
	| 'click'
	| 'hover'
	| 'focus'
	| 'focus-out'
	| 'list-navigation'
	| 'safe-polygon';

export interface FloatingEvents {
	emit<T extends string>(event: T, data?: any): void;
	on(event: string, handler: (data: any) => void): void;
	off(event: string, handler: (data: any) => void): void;
}

export interface ContextData {
	openEvent?: Event;
	floatingContext?: FloatingContext;
	/** @deprecated use `onTypingChange` prop in `useTypeahead` */
	typing?: boolean;
	[key: string]: any;
}

/**
 * The pre-configured positioning styles for the floating element. Upstream
 * types this as `React.CSSProperties`; the port returns exactly this object
 * shape, which is assignable to octane's `style` prop.
 */
export interface FloatingStyles {
	position: Strategy;
	top: number;
	left: number;
	transform?: string;
	willChange?: string;
}

// ─── Positioning core (the @floating-ui/react-dom `useFloating` surface) ─────

export type UsePositionFloatingOptions<RT extends ReferenceType = ReferenceType> = Prettify<
	Partial<ComputePositionConfig> & {
		/**
		 * A callback invoked when both the reference and floating elements are
		 * mounted, and cleaned up when either is unmounted. This is useful for
		 * setting up event listeners (e.g. pass `autoUpdate`).
		 */
		whileElementsMounted?: (
			reference: RT,
			floating: HTMLElement,
			update: () => void,
		) => void | (() => void);
		/**
		 * Object containing the reference and floating elements.
		 */
		elements?: {
			reference?: RT | null;
			floating?: HTMLElement | null;
		};
		/**
		 * The `open` state of the floating element to synchronize with the
		 * `isPositioned` value.
		 * @default false
		 */
		open?: boolean;
		/**
		 * Whether to use `transform` for positioning instead of `top` and `left`
		 * (layout) in the `floatingStyles` object.
		 * @default true
		 */
		transform?: boolean;
	}
>;

export type UsePositionFloatingData = Prettify<ComputePositionReturn & { isPositioned: boolean }>;

export type UsePositionFloatingReturn<RT extends ReferenceType = ReferenceType> = Prettify<
	UsePositionFloatingData & {
		/**
		 * Update the position of the floating element, re-rendering the component
		 * if required.
		 */
		update: () => void;
		/**
		 * Pre-configured positioning styles to apply to the floating element.
		 */
		floatingStyles: FloatingStyles;
		/**
		 * Object containing the reference and floating refs and reactive setters.
		 */
		refs: {
			reference: MutableRefObject<RT | null>;
			floating: MutableRefObject<HTMLElement | null>;
			setReference: (node: RT | null) => void;
			setFloating: (node: HTMLElement | null) => void;
		};
		/**
		 * Object containing the reference and floating elements.
		 */
		elements: {
			reference: RT | null;
			floating: HTMLElement | null;
		};
	}
>;

/** Options for the ref-aware `arrow` middleware (accepts an octane ref or an element). */
export interface ArrowOptions {
	/**
	 * The arrow element to be positioned.
	 * @default undefined
	 */
	element: MutableRefObject<Element | null> | Element | null;
	/**
	 * The padding between the arrow element and the floating element edges.
	 * Useful when the floating element has rounded corners.
	 * @default 0
	 */
	padding?: Padding;
}

// ─── Interaction context (the @floating-ui/react `useFloating` surface) ──────

export interface ExtendedRefs<RT> {
	reference: MutableRefObject<ReferenceType | null>;
	floating: MutableRefObject<HTMLElement | null>;
	domReference: MutableRefObject<NarrowedElement<RT> | null>;
	setReference(node: RT | null): void;
	setFloating(node: HTMLElement | null): void;
	setPositionReference(node: ReferenceType | null): void;
}

export interface ExtendedElements<RT> {
	reference: ReferenceType | null;
	floating: HTMLElement | null;
	domReference: NarrowedElement<RT> | null;
}

export type FloatingContext<RT extends ReferenceType = ReferenceType> = Omit<
	UsePositionFloatingReturn<RT>,
	'refs' | 'elements'
> & {
	open: boolean;
	onOpenChange(open: boolean, event?: Event, reason?: OpenChangeReason): void;
	events: FloatingEvents;
	dataRef: MutableRefObject<ContextData>;
	nodeId: string | undefined;
	floatingId: string;
	refs: ExtendedRefs<RT>;
	elements: ExtendedElements<RT>;
};

export interface FloatingRootContext<RT extends ReferenceType = ReferenceType> {
	dataRef: MutableRefObject<ContextData>;
	open: boolean;
	onOpenChange: (open: boolean, event?: Event, reason?: OpenChangeReason) => void;
	elements: {
		domReference: Element | null;
		reference: RT | null;
		floating: HTMLElement | null;
	};
	events: FloatingEvents;
	floatingId: string;
	refs: {
		setPositionReference(node: ReferenceType | null): void;
	};
}

export interface UseFloatingRootContextOptions {
	open?: boolean;
	onOpenChange?: (open: boolean, event?: Event, reason?: OpenChangeReason) => void;
	elements: {
		reference: Element | null;
		floating: HTMLElement | null;
	};
}

export interface UseFloatingOptions<RT extends ReferenceType = ReferenceType> extends Omit<
	UsePositionFloatingOptions<RT>,
	'elements'
> {
	rootContext?: FloatingRootContext<RT>;
	/**
	 * Object of external elements as an alternative to the `refs` object setters.
	 */
	elements?: {
		/**
		 * Externally passed reference element. Store in state.
		 */
		reference?: Element | null;
		/**
		 * Externally passed floating element. Store in state.
		 */
		floating?: HTMLElement | null;
	};
	/**
	 * An event callback that is invoked when the floating element is opened or
	 * closed.
	 */
	onOpenChange?(open: boolean, event?: Event, reason?: OpenChangeReason): void;
	/**
	 * Unique node id when using `FloatingTree`.
	 */
	nodeId?: string;
}

export type UseFloatingReturn<RT extends ReferenceType = ReferenceType> = Prettify<
	Omit<UsePositionFloatingReturn<RT>, 'refs' | 'elements'> & {
		/**
		 * `FloatingContext`
		 */
		context: Prettify<FloatingContext<RT>>;
		/**
		 * Object containing the reference and floating refs and reactive setters.
		 */
		refs: ExtendedRefs<RT>;
		elements: ExtendedElements<RT>;
	}
>;

export type UseFloatingData = Prettify<UseFloatingReturn>;

// ─── Interaction prop getters (useInteractions) ──────────────────────────────

/**
 * An octane HTML prop bag: octane's JSX attribute surface (NATIVE event
 * handlers — octane has no synthetic events) plus an open string index, since
 * the interaction hooks and prop getters merge arbitrary keys (aria-*, data-*,
 * ref). The octane analog of upstream's `React.HTMLProps<T>`.
 */
export type HTMLProps<T extends EventTarget = HTMLElement> = Octane.HTMLAttributes<T> & {
	[key: string]: unknown;
};

export interface ExtendedUserProps {
	active?: boolean;
	selected?: boolean;
}

export interface ElementProps {
	reference?: HTMLProps<Element>;
	floating?: HTMLProps<HTMLElement>;
	item?: HTMLProps<HTMLElement> | ((props: ExtendedUserProps) => HTMLProps<HTMLElement>);
}

export interface UseInteractionsReturn {
	// The `| object` widening keeps prop bags typed against other libraries'
	// HTML prop shapes (e.g. React's) callable — the getters merge any object.
	getReferenceProps: (userProps?: HTMLProps<Element> | object) => Record<string, unknown>;
	getFloatingProps: (userProps?: HTMLProps<HTMLElement> | object) => Record<string, unknown>;
	getItemProps: (
		userProps?: (Omit<HTMLProps<HTMLElement>, 'selected' | 'active'> & ExtendedUserProps) | object,
	) => Record<string, unknown>;
}

// ─── Tree ────────────────────────────────────────────────────────────────────

export interface FloatingNodeType<RT extends ReferenceType = ReferenceType> {
	id: string | undefined;
	parentId: string | null;
	context?: FloatingContext<RT>;
}

export interface FloatingTreeType<RT extends ReferenceType = ReferenceType> {
	nodesRef: MutableRefObject<Array<FloatingNodeType<RT>>>;
	events: FloatingEvents;
	addNode(node: FloatingNodeType): void;
	removeNode(node: FloatingNodeType): void;
}

// ─── Shared interaction-hook types ───────────────────────────────────────────

export type Delay =
	| number
	| Partial<{
			open: number;
			close: number;
	  }>;

export interface SafePolygonOptions {
	buffer?: number;
	blockPointerEvents?: boolean;
	requireIntent?: boolean;
}

export interface HandleCloseContext extends FloatingContext {
	onClose: () => void;
	tree?: FloatingTreeType | null;
	leave?: boolean;
}

export interface HandleClose {
	(context: HandleCloseContext): (event: MouseEvent) => void;
	__options?: SafePolygonOptions;
}
