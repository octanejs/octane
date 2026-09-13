/** @jsxImportSource octane */
import { useEffect, useMemo } from 'octane';
import type { HierarchyState, DropdownAnchor } from '../../types.js';
import {
	HIERARCHY_INDENT_PX,
	HIERARCHY_MENU_MIN_WIDTH_PX,
	MENU_HIGHLIGHT_CORNER_SHAPE,
	MENU_PANEL_CORNER_RADIUS_PX,
} from '../../constants.js';
import { cn } from '../../utils/cn.js';
import { Menu, createMenuStore } from '../menu/index.js';
import { AnchoredDropdownSurface } from '../ui/anchored-dropdown-surface.js';

interface HierarchyMenuProps {
	position: DropdownAnchor | null;
	state?: HierarchyState;
}

// Display-only tree of the current selection's DOM neighborhood. It is
// non-interactive (see AnchoredDropdownSurface interactive={false}); the active
// row is driven entirely by keyboard navigation in core via `state.activeIndex`,
// which feeds the menu store's controlled highlight.
export const HierarchyMenu = (props: HierarchyMenuProps) => {
	const activeIndex = () => props.state?.activeIndex ?? 0;

	// Controlled store: seed the active row from the initial index, then push
	// subsequent changes through setControlledValue. The store persists across
	// renders and is disposed on unmount.
	const menuStore = useMemo(
		() =>
			createMenuStore({
				value: String(props.state?.activeIndex ?? 0),
				highlight: {
					topCornerRadiusPx: MENU_PANEL_CORNER_RADIUS_PX,
					bottomCornerRadiusPx: MENU_PANEL_CORNER_RADIUS_PX,
					cornerShape: MENU_HIGHLIGHT_CORNER_SHAPE,
				},
			}),
		[],
	);

	useEffect(() => {
		menuStore.setControlledValue(String(activeIndex()));
	}, [props.state?.activeIndex]);

	useEffect(() => () => menuStore.dispose(), []);

	return (
		<AnchoredDropdownSurface
			position={props.position}
			dataAttribute="data-react-grab-hierarchy-menu"
			interactive={false}
		>
			<Menu.Panel class="overflow-hidden" style={{ minWidth: `${HIERARCHY_MENU_MIN_WIDTH_PX}px` }}>
				<Menu.Provider store={menuStore}>
					<Menu.List label="Navigate element hierarchy">
						{(props.state?.items ?? []).map((item, itemIndex) => (
							<Menu.Item
								key={itemIndex}
								value={String(itemIndex)}
								role="menuitemradio"
								checked={itemIndex === activeIndex()}
							>
								<span class="flex items-center min-w-0 w-full">
									{item.depth > 0 && (
										<span
											aria-hidden="true"
											class="shrink-0 font-mono text-[11px] leading-4 text-[var(--rg-text-secondary)] opacity-60 mr-1"
											style={{ paddingLeft: `${(item.depth - 1) * HIERARCHY_INDENT_PX}px` }}
										>
											{(item.isLast ? '└─' : '├─') as string}
										</span>
									)}
									<span
										class={cn(
											'text-[13px] leading-4 h-fit font-medium overflow-hidden text-ellipsis whitespace-nowrap min-w-0 transition-colors',
											itemIndex === activeIndex()
												? 'text-[var(--rg-text-primary)]'
												: 'text-[var(--rg-text-secondary)]',
										)}
									>
										{item.componentName && (
											<>
												<span>{item.componentName as string}</span>
												<span class="text-[var(--rg-text-secondary)]">.</span>
											</>
										)}
										<span>{item.tagName as string}</span>
									</span>
								</span>
							</Menu.Item>
						))}
					</Menu.List>
				</Menu.Provider>
			</Menu.Panel>
		</AnchoredDropdownSurface>
	);
};
