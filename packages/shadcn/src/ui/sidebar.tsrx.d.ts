type Props = { className?: string } & Record<string, unknown>;

export interface SidebarContextProps {
	state: 'expanded' | 'collapsed';
	open: boolean;
	setOpen: (open: boolean) => void;
	openMobile: boolean;
	setOpenMobile: (open: boolean) => void;
	isMobile: boolean;
	toggleSidebar: () => void;
}

export interface SidebarProviderProps extends Record<string, unknown> {
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	className?: string;
	style?: Record<string, unknown>;
	children?: unknown;
}

export interface SidebarProps extends Record<string, unknown> {
	side?: 'left' | 'right';
	variant?: 'sidebar' | 'floating' | 'inset';
	collapsible?: 'offcanvas' | 'icon' | 'none';
	className?: string;
	children?: unknown;
	dir?: string;
}

export interface SidebarTriggerProps extends Record<string, unknown> {
	className?: string;
	onClick?: (event: MouseEvent) => void;
}

export interface SidebarMenuButtonProps extends Record<string, unknown> {
	className?: string;
	asChild?: boolean;
	isActive?: boolean;
	variant?: 'default' | 'outline' | null;
	size?: 'default' | 'sm' | 'lg' | null;
	tooltip?: string | Record<string, unknown>;
}

export function useSidebar(): SidebarContextProps;
export function SidebarProvider(props: SidebarProviderProps): any;
export function Sidebar(props: SidebarProps): any;
export function SidebarTrigger(props: SidebarTriggerProps): any;
export function SidebarRail(props: Props): any;
export function SidebarInset(props: Props): any;
export function SidebarInput(props: Props): any;
export function SidebarHeader(props: Props): any;
export function SidebarFooter(props: Props): any;
export function SidebarSeparator(props: Props): any;
export function SidebarContent(props: Props): any;
export function SidebarGroup(props: Props): any;
export function SidebarGroupLabel(props: Props & { asChild?: boolean }): any;
export function SidebarGroupAction(props: Props & { asChild?: boolean }): any;
export function SidebarGroupContent(props: Props): any;
export function SidebarMenu(props: Props): any;
export function SidebarMenuItem(props: Props): any;
export function SidebarMenuButton(props: SidebarMenuButtonProps): any;
export function SidebarMenuAction(props: Props & { asChild?: boolean; showOnHover?: boolean }): any;
export function SidebarMenuBadge(props: Props): any;
export function SidebarMenuSkeleton(props: Props & { showIcon?: boolean }): any;
export function SidebarMenuSub(props: Props): any;
export function SidebarMenuSubItem(props: Props): any;
export function SidebarMenuSubButton(
	props: Props & { asChild?: boolean; size?: 'sm' | 'md'; isActive?: boolean },
): any;
