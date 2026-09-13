/** @jsxImportSource octane */
import type { OctaneNode } from 'octane';
import { MenuContext, type MenuStore } from './menu-context.js';

interface MenuProviderProps {
	store: MenuStore;
	children: OctaneNode;
}

export const MenuProvider = (props: MenuProviderProps) => (
	<MenuContext.Provider value={props.store}>{props.children}</MenuContext.Provider>
);
