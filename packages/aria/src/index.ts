// @octanejs/aria — the `react-aria` surface, ported onto octane. Exports mirror the
// upstream monopackage index (.react-spectrum/packages/react-aria/exports/index.ts) and
// grow area-by-area with the migration plan (docs/aria-migration-plan.md).

// interactions
export { useFocus } from './interactions/useFocus';
export { useFocusVisible } from './interactions/useFocusVisible';
export { useFocusWithin } from './interactions/useFocusWithin';
export { useHover } from './interactions/useHover';
export { useInteractOutside } from './interactions/useInteractOutside';
export { useKeyboard } from './interactions/useKeyboard';
export { useMove } from './interactions/useMove';
export { usePress } from './interactions/usePress';
export { useLongPress } from './interactions/useLongPress';
export { useFocusable, Focusable } from './interactions/useFocusable';
export { Pressable } from './interactions/Pressable';

// utils
export { chain } from './utils/chain';
export { mergeProps } from './utils/mergeProps';
export { mergeRefs } from './utils/mergeRefs';
export { RouterProvider } from './utils/openLink';
export { useId } from './utils/useId';
export { useObjectRef } from './utils/useObjectRef';

// ssr
export { SSRProvider, useIsSSR } from './ssr/SSRProvider';

// types — upstream re-exports the React-free event/prop types from @react-types/shared;
// the event-handler prop types come from the ported modules, where React's synthetic
// event types became native ones.
export type { FocusProps, FocusResult } from './interactions/useFocus';
export type { FocusVisibleProps, FocusVisibleResult } from './interactions/useFocusVisible';
export type { FocusWithinProps, FocusWithinResult } from './interactions/useFocusWithin';
export type { HoverProps, HoverResult } from './interactions/useHover';
export type { InteractOutsideProps } from './interactions/useInteractOutside';
export type { KeyboardProps, KeyboardResult } from './interactions/useKeyboard';
export type { LongPressProps, LongPressResult } from './interactions/useLongPress';
export type { MoveResult } from './interactions/useMove';
export type { PressHookProps, PressProps, PressResult } from './interactions/usePress';
export type { PressableProps } from './interactions/Pressable';
export type { FocusableAria, FocusableOptions, FocusableProps } from './interactions/useFocusable';
export type {
	MoveEvents,
	PressEvent,
	PressEvents,
	LongPressEvent,
	MoveStartEvent,
	MoveMoveEvent,
	MoveEndEvent,
} from '@react-types/shared';
export type { SSRProviderProps } from './ssr/SSRProvider';
