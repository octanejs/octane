import type { Component, JSX, OctaneNode } from '../../reactive.js';
import { MenuContext, type MenuStore } from './menu-context.js';

interface MenuProviderProps {
	store: MenuStore;
	children: OctaneNode;
}

export const MenuProvider: Component<MenuProviderProps> = (props) =>
	<MenuContext.Provider value={props.store}>{props.children}</MenuContext.Provider>;
