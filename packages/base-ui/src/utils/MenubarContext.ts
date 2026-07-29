// Ported from .base-ui/packages/react/src/menubar/MenubarContext.ts (v1.6.0), octane-adapted
// (`React.createContext` → octane `createContext`; `React.RefObject` → a plain ref shape).
//
// STAGING: only the CONTEXT lands here, ahead of the `Menubar` component itself (Phase 3f stage 4).
// `Menu.Root`/`Menu.Trigger`/`Menu.Positioner` branch on `parent.type === 'menubar'` in several
// places; having the context now lets those branches be transcribed verbatim instead of being
// stubbed out and re-added later. Until `Menubar` lands nothing provides this context, so
// `useMenubarContext(true)` always returns `null`.
import { createContext, useContext } from 'octane';

import type { MenuRootOrientation } from '../menu';

export interface MenubarContextValue {
	modal: boolean;
	disabled: boolean;
	contentElement: HTMLElement | null;
	setContentElement: (element: HTMLElement | null) => void;
	hasSubmenuOpen: boolean;
	setHasSubmenuOpen: (open: boolean) => void;
	orientation: MenuRootOrientation;
	allowMouseUpTriggerRef: { current: boolean };
	rootId: string | undefined;
}

export const MenubarContext = createContext<MenubarContextValue | null>(null);

export function useMenubarContext(optional?: false): MenubarContextValue;
export function useMenubarContext(optional: true): MenubarContextValue | null;
export function useMenubarContext(optional?: boolean): MenubarContextValue | null {
	const context = useContext(MenubarContext);
	if (context === null && !optional) {
		throw new Error(
			'Base UI: MenubarContext is missing. Menubar parts must be placed within <Menubar>.',
		);
	}

	return context;
}
