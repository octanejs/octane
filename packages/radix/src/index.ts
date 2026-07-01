// @octanejs/radix — a port of Radix UI Primitives (@radix-ui/react) on the octane
// renderer. Mirrors the unified `radix-ui` package's shape: low-level composition
// utilities are exported directly, and each component is a namespace (`Separator.Root`).
//
// Phase 0 (foundation) + first proof components. See docs/radix-migration-plan.md.

// Composition foundation.
export { Slot, Slottable } from './Slot';
export { Primitive } from './Primitive';
export { composeRefs, useComposedRefs } from './compose-refs';
export { composeEventHandlers } from './compose-event-handlers';
export { useControllableState } from './useControllableState';
export { Presence } from './Presence';

// Components (namespaced, e.g. `<Separator.Root/>`, `<Accordion.Root/>`).
export * as Separator from './Separator';
export * as Label from './Label';
export * as Collapsible from './Collapsible';
export * as Accordion from './Accordion';
