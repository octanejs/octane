import { MenuProvider } from './menu-provider.tsrx';
import { MenuPanel } from './menu-panel.tsrx';
import { MenuList } from './menu-list.tsrx';
import { MenuItem } from './menu-item.tsrx';
import { MenuItemLabel } from './menu-item-label.tsrx';
import { MenuShortcut } from './menu-shortcut.tsrx';

export { createMenuStore } from './menu-store.js';

export const Menu = {
	Provider: MenuProvider,
	Panel: MenuPanel,
	List: MenuList,
	Item: MenuItem,
	Label: MenuItemLabel,
	Shortcut: MenuShortcut,
};
