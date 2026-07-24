type Props = { className?: string } & Record<string, unknown>;

export declare const navigationMenuTriggerStyle: (props?: {
	class?: unknown;
	className?: unknown;
}) => string;

export function NavigationMenu(props: Props & { children?: unknown; viewport?: boolean }): any;
export function NavigationMenuList(props: Props): any;
export function NavigationMenuItem(props: Props): any;
export function NavigationMenuTrigger(props: Props & { children?: unknown }): any;
export function NavigationMenuContent(props: Props): any;
export function NavigationMenuViewport(props: Props): any;
export function NavigationMenuLink(props: Props): any;
export function NavigationMenuIndicator(props: Props): any;
export {};
