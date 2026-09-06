import { NavigationMenu } from '@octanejs/base-ui/navigation-menu';

export function NavigationMenuContentServerCase1() {
	return <NavigationMenu.Root>
		<NavigationMenu.List>
			<NavigationMenu.Item>
				<NavigationMenu.Trigger>Item 1</NavigationMenu.Trigger>
				<NavigationMenu.Content keepMounted data-testid="content-1">
					<NavigationMenu.Link href="#link-1">Link 1</NavigationMenu.Link>
				</NavigationMenu.Content>
			</NavigationMenu.Item>
		</NavigationMenu.List>
		<NavigationMenu.Portal>
			<NavigationMenu.Positioner>
				<NavigationMenu.Popup>
					<NavigationMenu.Viewport />
				</NavigationMenu.Popup>
			</NavigationMenu.Positioner>
		</NavigationMenu.Portal>
	</NavigationMenu.Root>;
}

export function NavigationMenuContentServerCase2() {
	return <NavigationMenu.Root>
		<NavigationMenu.List>
			<NavigationMenu.Item>
				<NavigationMenu.Trigger>Item 1</NavigationMenu.Trigger>
				<NavigationMenu.Content data-testid="content-1">
					<NavigationMenu.Link href="#link-1">Link 1</NavigationMenu.Link>
				</NavigationMenu.Content>
			</NavigationMenu.Item>
		</NavigationMenu.List>
		<NavigationMenu.Portal>
			<NavigationMenu.Positioner>
				<NavigationMenu.Popup>
					<NavigationMenu.Viewport />
				</NavigationMenu.Popup>
			</NavigationMenu.Positioner>
		</NavigationMenu.Portal>
	</NavigationMenu.Root>;
}
