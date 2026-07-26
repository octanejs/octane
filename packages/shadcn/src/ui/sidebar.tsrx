// Sidebar — maintainer-supplied default-Tailwind flavor, class strings
// verbatim. Octane adaptations: "use client" dropped, lucide-react →
// @octanejs/lucide, radix-ui Slot → @octanejs/radix; the provider/Sheet/tooltip
// trees compose with createElement where a child must be a real element
// descriptor (Context.Provider, Portal subtrees, `asChild` slot targets), and
// CSS custom properties in `style` are cast (they sit outside CSSProperties).
import {
	createContext,
	createElement,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type OctaneNode,
} from 'octane';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@octanejs/radix';
import { PanelLeftIcon } from '@octanejs/lucide';

import { cn } from '../lib/utils';
import { useIsMobile } from '../hooks/use-mobile';
import { Button } from './button.tsrx';
import { Input } from './input.tsrx';
import { Separator } from './separator.tsrx';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './sheet.tsrx';
import { Skeleton } from './skeleton.tsrx';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip.tsrx';

const SIDEBAR_COOKIE_NAME = 'sidebar_state';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = '16rem';
const SIDEBAR_WIDTH_MOBILE = '18rem';
const SIDEBAR_WIDTH_ICON = '3rem';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

type Props = { className?: string; children?: OctaneNode } & Record<string, unknown>;

export interface SidebarContextProps {
	state: 'expanded' | 'collapsed';
	open: boolean;
	setOpen: (open: boolean) => void;
	openMobile: boolean;
	setOpenMobile: (open: boolean) => void;
	isMobile: boolean;
	toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextProps | null>(null);

export function useSidebar(): SidebarContextProps {
	const context = useContext(SidebarContext);
	if (!context) {
		throw new Error('useSidebar must be used within a SidebarProvider.');
	}

	return context;
}

export function SidebarProvider(props: Props & {
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	style?: Record<string, string>;
}) {
	const {
		defaultOpen = true,
		open: openProp,
		onOpenChange: setOpenProp,
		className,
		style,
		children: _children,
		...rest
	} = props;
	const isMobile = useIsMobile();
	const [openMobile, setOpenMobile] = useState(false);

	// This is the internal state of the sidebar.
	// We use openProp and setOpenProp for control from outside the component.
	const [_open, _setOpen] = useState(defaultOpen);
	const open = openProp ?? _open;
	const setOpen = useCallback((value: boolean | ((value: boolean) => boolean)) => {
		const openState =
			typeof value === 'function' ? value(open) : value;
		if (setOpenProp) {
			setOpenProp(openState);
		} else {
			_setOpen(openState);
		}

		// This sets the cookie to keep the sidebar state.
		document.cookie =
			`${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
	});

	// Helper to toggle the sidebar.
	const toggleSidebar = useCallback(() => {
		return isMobile ? setOpenMobile((value) => !value) : setOpen((value) => !value);
	});

	// Adds a keyboard shortcut to toggle the sidebar.
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				toggleSidebar();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	});

	// We add a state so that we can do data-state="expanded" or "collapsed".
	// This makes it easier to style the sidebar with Tailwind classes.
	const state = open ? 'expanded' : 'collapsed';

	const contextValue = useMemo<SidebarContextProps>(
		() => ({
			state,
			open,
			setOpen,
			isMobile,
			openMobile,
			setOpenMobile,
			toggleSidebar,
		}),
	);

	return createElement(
		SidebarContext.Provider,
		{ value: contextValue },
		createElement(
			'div',
			{
				'data-slot': 'sidebar-wrapper',
				style: {
					'--sidebar-width': SIDEBAR_WIDTH,
					'--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
					...style,
				} as Record<string, string>,
				className: cn(
					'group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar',
					className,
				),
				...rest,
			},
			props.children,
		),
	);
}

export function Sidebar(props: Props & {
	side?: 'left' | 'right';
	variant?: 'sidebar' | 'floating' | 'inset';
	collapsible?: 'offcanvas' | 'icon' | 'none';
	dir?: string;
}) {
	const {
		side = 'left',
		variant = 'sidebar',
		collapsible = 'offcanvas',
		className,
		children: _children,
		dir,
		...rest
	} = props;
	const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

	if (collapsible === 'none') {
		return createElement(
			'div',
			{
				'data-slot': 'sidebar',
				className: cn(
					'flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground',
					className,
				),
				...rest,
			},
			props.children,
		);
	}

	if (isMobile) {
		return createElement(
			Sheet,
			{ open: openMobile, onOpenChange: setOpenMobile, ...rest },
			createElement(
				SheetContent,
				{
					dir,
					'data-sidebar': 'sidebar',
					'data-slot': 'sidebar',
					'data-mobile': 'true',
					className: 'w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden',
					style: { '--sidebar-width': SIDEBAR_WIDTH_MOBILE } as Record<string, string>,
					side,
				},
				createElement(
					SheetHeader,
					{ key: 'header', className: 'sr-only' },
					createElement(SheetTitle, { key: 'title' }, 'Sidebar'),
					createElement(SheetDescription, { key: 'desc' }, 'Displays the mobile sidebar.'),
				),
				createElement(
					'div',
					{ key: 'body', className: 'flex h-full w-full flex-col' },
					props.children,
				),
			),
		);
	}

	return createElement(
		'div',
		{
			className: 'group peer hidden text-sidebar-foreground md:block',
			'data-state': state,
			'data-collapsible': state === 'collapsed' ? collapsible : '',
			'data-variant': variant,
			'data-side': side,
			'data-slot': 'sidebar',
		},
		// This is what handles the sidebar gap on desktop
		createElement('div', {
			key: 'gap',
			'data-slot': 'sidebar-gap',
			className: cn(
				'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
				'group-data-[collapsible=offcanvas]:w-0',
				'group-data-[side=right]:rotate-180',
				variant === 'floating' || variant === 'inset'
					? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
					: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
			),
		}),
		createElement(
			'div',
			{
				key: 'container',
				'data-slot': 'sidebar-container',
				'data-side': side,
				className: cn(
					'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] md:flex',
					// Adjust the padding for floating and inset variants.
					variant === 'floating' || variant === 'inset'
						? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
						: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l',
					className,
				),
				...rest,
			},
			createElement(
				'div',
				{
					'data-sidebar': 'sidebar',
					'data-slot': 'sidebar-inner',
					className: 'flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border',
				},
				props.children,
			),
		),
	);
}

export function SidebarTrigger({ className, onClick, ...props }: Props & {
	onClick?: (event: MouseEvent) => void;
}) @{
	const { toggleSidebar } = useSidebar();

	<Button
		data-sidebar="trigger"
		data-slot="sidebar-trigger"
		variant="ghost"
		size="icon-sm"
		className={cn(className)}
		onClick={(event: MouseEvent) => {
			onClick?.(event);
			toggleSidebar();
		}}
		{...props}
	>
		<PanelLeftIcon className="cn-rtl-flip" />
		<span className="sr-only">Toggle Sidebar</span>
	</Button>
}

export function SidebarRail({ className, ...props }: Props) @{
	const { toggleSidebar } = useSidebar();

	<button
		data-sidebar="rail"
		data-slot="sidebar-rail"
		aria-label="Toggle Sidebar"
		tabIndex={-1}
		onClick={toggleSidebar}
		title="Toggle Sidebar"
		className={cn(
			'absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] hover:after:bg-sidebar-border sm:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2',
			'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
			'[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
			'group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar',
			'[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
			'[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
			className,
		)}
		{...props}
	/>
}

export function SidebarInset({ className, ...props }: Props) @{
	<main
		data-slot="sidebar-inset"
		className={cn(
			'relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2',
			className,
		)}
		{...props}
	/>
}

export function SidebarInput({ className, ...props }: Props) @{
	<Input
		data-slot="sidebar-input"
		data-sidebar="input"
		className={cn('h-8 w-full bg-background shadow-none', className)}
		{...props}
	/>
}

export function SidebarHeader({ className, ...props }: Props) @{
	<div
		data-slot="sidebar-header"
		data-sidebar="header"
		className={cn('flex flex-col gap-2 p-2', className)}
		{...props}
	/>
}

export function SidebarFooter({ className, ...props }: Props) @{
	<div
		data-slot="sidebar-footer"
		data-sidebar="footer"
		className={cn('flex flex-col gap-2 p-2', className)}
		{...props}
	/>
}

export function SidebarSeparator({ className, ...props }: Props) @{
	<Separator
		data-slot="sidebar-separator"
		data-sidebar="separator"
		className={cn('mx-2 w-auto bg-sidebar-border', className)}
		{...props}
	/>
}

export function SidebarContent({ className, ...props }: Props) @{
	<div
		data-slot="sidebar-content"
		data-sidebar="content"
		className={cn(
			'no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
			className,
		)}
		{...props}
	/>
}

export function SidebarGroup({ className, ...props }: Props) @{
	<div
		data-slot="sidebar-group"
		data-sidebar="group"
		className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
		{...props}
	/>
}

export function SidebarGroupLabel({ className, asChild = false, ...props }: Props & {
	asChild?: boolean;
}) @{
	@if (asChild) {
		<Slot
			data-slot="sidebar-group-label"
			data-sidebar="group-label"
			className={cn(
				'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
				className,
			)}
			{...props}
		/>
	} @else {
		<div
			data-slot="sidebar-group-label"
			data-sidebar="group-label"
			className={cn(
				'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
				className,
			)}
			{...props}
		/>
	}
}

export function SidebarGroupAction({ className, asChild = false, ...props }: Props & {
	asChild?: boolean;
}) @{
	@if (asChild) {
		<Slot
			data-slot="sidebar-group-action"
			data-sidebar="group-action"
			className={cn(
				'absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0',
				className,
			)}
			{...props}
		/>
	} @else {
		<button
			data-slot="sidebar-group-action"
			data-sidebar="group-action"
			className={cn(
				'absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0',
				className,
			)}
			{...props}
		/>
	}
}

export function SidebarGroupContent({ className, ...props }: Props) @{
	<div
		data-slot="sidebar-group-content"
		data-sidebar="group-content"
		className={cn('w-full text-sm', className)}
		{...props}
	/>
}

export function SidebarMenu({ className, ...props }: Props) @{
	<ul
		data-slot="sidebar-menu"
		data-sidebar="menu"
		className={cn('flex w-full min-w-0 flex-col gap-0', className)}
		{...props}
	/>
}

export function SidebarMenuItem({ className, ...props }: Props) @{
	<li
		data-slot="sidebar-menu-item"
		data-sidebar="menu-item"
		className={cn('group/menu-item relative', className)}
		{...props}
	/>
}

const sidebarMenuButtonVariants = cva(
	'peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-sidebar-accent data-open:hover:text-sidebar-accent-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate',
	{
		variants: {
			variant: {
				default: 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
				outline: 'bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]',
			},
			size: {
				default: 'h-8 text-sm',
				sm: 'h-7 text-xs',
				lg: 'h-12 text-sm group-data-[collapsible=icon]:p-0!',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

export function SidebarMenuButton(props: Props & {
	asChild?: boolean;
	isActive?: boolean;
	tooltip?: string | Record<string, unknown>;
	variant?: VariantProps<typeof sidebarMenuButtonVariants>['variant'];
	size?: VariantProps<typeof sidebarMenuButtonVariants>['size'];
}) {
	const {
		asChild = false,
		isActive = false,
		variant = 'default',
		size = 'default',
		tooltip,
		className,
		children: _children,
		...rest
	} = props;
	const { isMobile, state } = useSidebar();

	const button = createElement(
		asChild ? Slot : 'button',
		{
			'data-slot': 'sidebar-menu-button',
			'data-sidebar': 'menu-button',
			'data-size': size,
			'data-active': isActive,
			className: cn(sidebarMenuButtonVariants({ variant, size }), className),
			...rest,
		},
		props.children,
	);

	if (!tooltip) {
		return button;
	}

	const tooltipProps =
		typeof tooltip === 'string' ? { children: tooltip } : tooltip;

	return createElement(
		Tooltip,
		{},
		createElement(TooltipTrigger, { key: 'trigger', asChild: true }, button),
		createElement(TooltipContent, {
			key: 'content',
			side: 'right',
			align: 'center',
			hidden: state !== 'collapsed' || isMobile,
			...tooltipProps,
		}),
	);
}

export function SidebarMenuAction({
	className,
	asChild = false,
	showOnHover = false,
	...props
}: Props & {
	asChild?: boolean;
	showOnHover?: boolean;
}) @{
	@if (asChild) {
		<Slot
			data-slot="sidebar-menu-action"
			data-sidebar="menu-action"
			className={cn(
				'absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0',
				showOnHover &&
					'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground aria-expanded:opacity-100 md:opacity-0',
				className,
			)}
			{...props}
		/>
	} @else {
		<button
			data-slot="sidebar-menu-action"
			data-sidebar="menu-action"
			className={cn(
				'absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0',
				showOnHover &&
					'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-sidebar-accent-foreground aria-expanded:opacity-100 md:opacity-0',
				className,
			)}
			{...props}
		/>
	}
}

export function SidebarMenuBadge({ className, ...props }: Props) @{
	<div
		data-slot="sidebar-menu-badge"
		data-sidebar="menu-badge"
		className={cn(
			'pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 peer-data-active/menu-button:text-sidebar-accent-foreground',
			className,
		)}
		{...props}
	/>
}

export function SidebarMenuSkeleton({ className, showIcon = false, ...props }: Props & {
	showIcon?: boolean;
}) @{
	// Random width between 50 to 90%.
	const [width] = useState(() => `${Math.floor(Math.random() * 40) + 50}%`);

	<div
		data-slot="sidebar-menu-skeleton"
		data-sidebar="menu-skeleton"
		className={cn('flex h-8 items-center gap-2 rounded-md px-2', className)}
		{...props}
	>
		@if (showIcon) {
			<Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />
		}
		<Skeleton
			className="h-4 max-w-(--skeleton-width) flex-1"
			data-sidebar="menu-skeleton-text"
			style={{ '--skeleton-width': width } as Record<string, string>}
		/>
	</div>
}

export function SidebarMenuSub({ className, ...props }: Props) @{
	<ul
		data-slot="sidebar-menu-sub"
		data-sidebar="menu-sub"
		className={cn(
			'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden',
			className,
		)}
		{...props}
	/>
}

export function SidebarMenuSubItem({ className, ...props }: Props) @{
	<li
		data-slot="sidebar-menu-sub-item"
		data-sidebar="menu-sub-item"
		className={cn('group/menu-sub-item relative', className)}
		{...props}
	/>
}

export function SidebarMenuSubButton({
	asChild = false,
	size = 'md',
	isActive = false,
	className,
	...props
}: Props & {
	asChild?: boolean;
	size?: 'sm' | 'md';
	isActive?: boolean;
}) @{
	@if (asChild) {
		<Slot
			data-slot="sidebar-menu-sub-button"
			data-sidebar="menu-sub-button"
			data-size={size}
			data-active={isActive}
			className={cn(
				'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground',
				className,
			)}
			{...props}
		/>
	} @else {
		<a
			data-slot="sidebar-menu-sub-button"
			data-sidebar="menu-sub-button"
			data-size={size}
			data-active={isActive}
			className={cn(
				'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-sm data-[size=sm]:text-xs data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground',
				className,
			)}
			{...props}
		/>
	}
}
