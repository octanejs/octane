/** @jsxImportSource octane */
import { useEffect, useMemo } from 'octane';
import type { ContextMenuAction, DropdownAnchor } from '../../types.js';
import {
	MENU_HIGHLIGHT_CORNER_SHAPE,
	MENU_PANEL_CORNER_RADIUS_PX,
	TOOLBAR_MENU_MIN_WIDTH_PX,
} from '../../constants.js';
import { Menu, createMenuStore } from '../menu/index.js';
import { AnchoredDropdownSurface } from '../ui/anchored-dropdown-surface.js';

interface ToolbarMenuProps {
	position: DropdownAnchor | null;
	actions: ContextMenuAction[];
	defaultActionId: string;
	onSetDefaultAction: (actionId: string) => void;
	onDismiss: () => void;
}

export const ToolbarMenu = (props: ToolbarMenuProps) => {
	// The store owns the highlight lifecycle and must survive re-renders, so
	// create it once and dispose it on unmount.
	const menuStore = useMemo(
		() =>
			createMenuStore({
				clearActiveOnPointerLeave: true,
				highlight: {
					topCornerRadiusPx: MENU_PANEL_CORNER_RADIUS_PX,
					bottomCornerRadiusPx: MENU_PANEL_CORNER_RADIUS_PX,
					cornerShape: MENU_HIGHLIGHT_CORNER_SHAPE,
				},
			}),
		[],
	);

	useEffect(() => () => menuStore.dispose(), []);

	return (
		<AnchoredDropdownSurface
			position={props.position}
			dataAttribute="data-react-grab-toolbar-menu"
			onDismiss={props.onDismiss}
		>
			<Menu.Panel class="overflow-hidden" style={{ minWidth: `${TOOLBAR_MENU_MIN_WIDTH_PX}px` }}>
				<Menu.Provider store={menuStore}>
					<Menu.List label="Default action">
						{props.actions.map((action) => {
							const isDefault = action.id === props.defaultActionId;

							return (
								<Menu.Item
									key={action.id}
									value={action.id}
									role="menuitemradio"
									checked={isDefault}
									onSelect={() => {
										props.onSetDefaultAction(action.id);
										props.onDismiss();
									}}
								>
									<Menu.Label
										class={
											isDefault
												? 'text-[var(--rg-text-primary)]'
												: 'text-[var(--rg-text-secondary)]'
										}
										textContent={action.label}
									/>
									{action.shortcut && (
										<Menu.Shortcut shortcut={action.shortcut} modifier={action.shortcutModifier} />
									)}
								</Menu.Item>
							);
						})}
					</Menu.List>
				</Menu.Provider>
			</Menu.Panel>
		</AnchoredDropdownSurface>
	);
};
