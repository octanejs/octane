// @octanejs/floating-ui — a port of @floating-ui/react on top of the agnostic
// @floating-ui/dom. PHASE 1 (positioning) is in place: useFloating, useMergeRefs,
// the ref-aware `arrow`, and the re-exported @floating-ui/dom middleware. The
// interaction hooks (useInteractions/useHover/useClick/useDismiss/useFocus/useRole/
// useListNavigation/useTypeahead/useClientPoint), the components (FloatingPortal/
// Overlay/FocusManager/Arrow/List/Tree, Composite), and transitions land in
// subsequent phases.

// Agnostic positioning core, re-exported from @floating-ui/dom.
export {
	autoPlacement,
	autoUpdate,
	computePosition,
	detectOverflow,
	flip,
	getOverflowAncestors,
	hide,
	inline,
	limitShift,
	offset,
	platform,
	shift,
	size,
} from '@floating-ui/dom';

// Positioning types, re-exported from @floating-ui/dom (mirrors upstream
// @floating-ui/react's type re-export surface).
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

// The shared octane-adapted type surface (mirrors @floating-ui/react's exported
// type names; see ./types for the octane adaptations).
export type {
	ArrowOptions,
	ContextData,
	Delay,
	ElementProps,
	ExtendedElements,
	ExtendedRefs,
	ExtendedUserProps,
	FloatingContext,
	FloatingEvents,
	FloatingNodeType,
	FloatingRootContext,
	FloatingStyles,
	FloatingTreeType,
	HandleClose,
	HandleCloseContext,
	HTMLProps,
	MutableRefObject,
	NarrowedElement,
	OpenChangeReason,
	RefCallback,
	ReferenceType,
	SafePolygonOptions,
	UseFloatingData,
	UseFloatingOptions,
	UseFloatingReturn,
	UseFloatingRootContextOptions,
	UseInteractionsReturn,
	UsePositionFloatingData,
	UsePositionFloatingOptions,
	UsePositionFloatingReturn,
} from './types';

// Positioning + context. The public `useFloating` (from ./context) wraps the
// positioning core and returns the interaction `context`.
export { useFloating, useFloatingRootContext, createPubSub } from './context';
export { arrow } from './useFloating';
// The bare positioning core (the @floating-ui/react-dom `useFloating` shape, no
// interaction context) — consumed by bindings that only position (e.g. @octanejs/radix's
// Popper). Call as `usePositionFloating([options, slot])`.
export { usePositionFloating } from './useFloating';
export { useMergeRefs } from './useMergeRefs';
export { useId } from './useId';
export {
	useFloatingTree,
	useFloatingParentNodeId,
	useFloatingNodeId,
	FloatingTree,
	FloatingNode,
	FloatingNodeContext,
	FloatingTreeContext,
} from './tree';

// Interaction hooks (phase 2 — in progress).
export { useInteractions } from './useInteractions';
export { useRole } from './useRole';
export { useClick } from './useClick';
export { useFocus } from './useFocus';
export { useDismiss } from './useDismiss';
export { useClientPoint } from './useClientPoint';
export { useListNavigation } from './useListNavigation';
export { useTypeahead } from './useTypeahead';
export { useHover } from './useHover';
export { safePolygon } from './safePolygon';
// Interaction-hook prop types (mirror upstream @floating-ui/react's names).
export type { UseRoleProps } from './useRole';
export type { UseClickProps } from './useClick';
export type { UseFocusProps } from './useFocus';
export type { UseDismissProps } from './useDismiss';
export type { UseClientPointProps } from './useClientPoint';
export type { UseListNavigationProps } from './useListNavigation';
export type { UseTypeaheadProps } from './useTypeahead';
export type { UseHoverProps } from './useHover';

// Components (phase 3 — in progress).
export { FloatingOverlay } from './FloatingOverlay';
export {
	FloatingPortal,
	FocusGuard,
	useFloatingPortalNode,
	usePortalContext,
	PortalContext,
} from './FloatingPortal';
export { FloatingList, useListItem, FloatingListContext } from './FloatingList';
export { FloatingArrow } from './FloatingArrow';
export { Composite, CompositeItem, CompositeContext } from './Composite';
export { FloatingFocusManager, VisuallyHiddenDismiss } from './FloatingFocusManager';

// Transitions + delay group (phase 4).
export { useTransitionStatus, useTransitionStyles } from './transitions';
export {
	FloatingDelayGroup,
	useDelayGroup,
	useDelayGroupContext,
	FloatingDelayGroupContext,
} from './delayGroup';

// Component / transition prop types (mirror upstream's exported names; the
// octane adaptations — OctaneNode children, ref-as-prop, native events — are
// documented on each type). FloatingListProps / UseListItemProps are exported
// here even though upstream keeps them module-private, since octane bindings
// compose them.
export type { CompositeProps, CompositeItemProps } from './Composite';
export type { FloatingArrowProps } from './FloatingArrow';
export type { FloatingFocusManagerProps } from './FloatingFocusManager';
export type { FloatingListProps, UseListItemProps } from './FloatingList';
export type { FloatingOverlayProps } from './FloatingOverlay';
export type { FloatingPortalProps, UseFloatingPortalNodeProps } from './FloatingPortal';
export type { FloatingNodeProps, FloatingTreeProps } from './tree';
export type {
	TransitionStatus,
	UseTransitionStatusProps,
	UseTransitionStylesProps,
} from './transitions';
export type { FloatingDelayGroupProps } from './delayGroup';
