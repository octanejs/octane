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
export { createContextScope } from './context';
export { useControllableState } from './useControllableState';
export { Presence } from './Presence';

// Components (namespaced, e.g. `<Separator.Root/>`, `<Accordion.Root/>`).
export * as Separator from './Separator';
export * as Label from './Label';
export * as Collapsible from './Collapsible';
export * as Accordion from './Accordion';
export * as Portal from './Portal';
export * as Dialog from './Dialog';
export * as AlertDialog from './AlertDialog';
export * as Toggle from './Toggle';
export * as ToggleGroup from './ToggleGroup';
export * as Tabs from './Tabs';
export * as RovingFocus from './RovingFocusGroup';
export * as AspectRatio from './AspectRatio';
export * as VisuallyHidden from './VisuallyHidden';
export * as Avatar from './Avatar';
export * as Progress from './Progress';
export * as Toolbar from './Toolbar';
export * as Arrow from './Arrow';
export * as Popper from './Popper';
export * as Tooltip from './Tooltip';
export * as Popover from './Popover';
export * as HoverCard from './HoverCard';
export * as Menu from './Menu';
export * as DropdownMenu from './DropdownMenu';
export * as ContextMenu from './ContextMenu';
export * as ScrollArea from './ScrollArea';
export * as Direction from './direction';
