// Ported from .base-ui/packages/react/src/context-menu/root/ContextMenuRootContext.ts (v1.6.0),
// octane-adapted (`React.createContext` → octane `createContext`; `React.RefObject` → plain ref
// shapes; `React.Dispatch<SetStateAction<T>>` → octane's updater signature).
//
// STAGING: only the CONTEXT lands here, ahead of the `ContextMenu` components themselves
// (Phase 3f stage 4). `Menu.Root`/`Menu.Trigger`/`Menu.Positioner`/`Menu.Popup` branch on
// `parent.type === 'context-menu'` in several places; having the context now lets those branches
// be transcribed verbatim instead of being stubbed out and re-added later. Until `ContextMenu.Root`
// lands nothing provides this context, so `useContextMenuRootContext()` always returns `undefined`.
import { createContext, useContext } from 'octane';

export interface ContextMenuRootContextValue {
	anchor: { getBoundingClientRect: () => DOMRect };
	setAnchor: (value: ContextMenuRootContextValue['anchor']) => void;
	backdropRef: { current: HTMLDivElement | null };
	internalBackdropRef: { current: HTMLDivElement | null };
	actionsRef: {
		current: {
			setOpen: (nextOpen: boolean, eventDetails: any) => void;
		} | null;
	};
	positionerRef: { current: HTMLElement | null };
	allowMouseUpTriggerRef: { current: boolean };
	initialCursorPointRef: { current: { x: number; y: number } | null };
	rootId: string | undefined;
}

export const ContextMenuRootContext = createContext<ContextMenuRootContextValue | undefined>(
	undefined,
);

export function useContextMenuRootContext(optional: false): ContextMenuRootContextValue;
export function useContextMenuRootContext(optional?: true): ContextMenuRootContextValue | undefined;
export function useContextMenuRootContext(
	optional = true,
): ContextMenuRootContextValue | undefined {
	const context = useContext(ContextMenuRootContext);
	if (context === undefined && !optional) {
		throw new Error(
			'Base UI: ContextMenuRootContext is missing. ContextMenu parts must be placed within <ContextMenu.Root>.',
		);
	}
	return context;
}
