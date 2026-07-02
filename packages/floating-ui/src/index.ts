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
