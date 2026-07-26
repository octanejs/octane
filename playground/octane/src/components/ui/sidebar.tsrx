// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/sidebar.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis). IconPlaceholder resolves to lucide (see
// spinner.tsrx); useIsMobile ports from ../hooks/use-mobile.ts. All class
// strings, the cva map, and every data-* attribute are byte-for-byte.
//
// SidebarProvider, Sidebar, and SidebarMenuButton are composed with
// createElement: the consumer's opaque compiled children can only flow through
// the props.children channel, and here they must sit inside the context
// Provider / beside sibling descriptors (see breadcrumb.tsrx's comment).
// Upstream's explicit hook dependency arrays are retained verbatim.
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

import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const SIDEBAR_COOKIE_NAME = 'sidebar_state';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = '16rem';
const SIDEBAR_WIDTH_MOBILE = '18rem';
const SIDEBAR_WIDTH_ICON = '3rem';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

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

export interface SidebarProviderProps extends Record<string, unknown> {
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	className?: string;
	style?: Record<string, unknown>;
	children?: OctaneNode;
}

export function SidebarProvider({
	defaultOpen = true,
	open: openProp,
	onOpenChange: setOpenProp,
	className,
	style,
	children,
	...props
}: SidebarProviderProps) {
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
	}, [setOpenProp, open]);

	// Helper to toggle the sidebar.
	const toggleSidebar = useCallback(() => {
		return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
	}, [isMobile, setOpen, setOpenMobile]);

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
	}, [toggleSidebar]);

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
		[state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar],
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
				},
				className: cn(
					'group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar',
					className,
				),
				...props,
			},
			children,
		),
	);
}

export interface SidebarProps extends Record<string, unknown> {
	side?: 'left' | 'right';
	variant?: 'sidebar' | 'floating' | 'inset';
	collapsible?: 'offcanvas' | 'icon' | 'none';
	className?: string;
	children?: OctaneNode;
	dir?: string;
}

export function Sidebar({
	side = 'left',
	variant = 'sidebar',
	collapsible = 'offcanvas',
	className,
	children,
	dir,
	...props
}: SidebarProps) {
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
				...props,
			},
			children,
		);
	}

	if (isMobile) {
		return createElement(
			Sheet,
			{ open: openMobile, onOpenChange: setOpenMobile, ...props },
			createElement(
				SheetContent,
				{
					dir,
					'data-sidebar': 'sidebar',
					'data-slot': 'sidebar',
					'data-mobile': 'true',
					className: 'w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden',
					style: {
						'--sidebar-width': SIDEBAR_WIDTH_MOBILE,
					},
					side,
				},
				createElement(
					SheetHeader,
					{ key: 'header', className: 'sr-only' },
					createElement(SheetTitle, { key: 'title' }, 'Sidebar'),
					createElement(SheetDescription, { key: 'description' }, 'Displays the mobile sidebar.'),
				),
				createElement('div', { key: 'body', className: 'flex h-full w-full flex-col' }, children),
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
				'cn-sidebar-gap relative w-(--sidebar-width) bg-transparent',
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
				...props,
			},
			createElement(
				'div',
				{
					'data-sidebar': 'sidebar',
					'data-slot': 'sidebar-inner',
					className: 'cn-sidebar-inner flex size-full flex-col',
				},
				children,
			),
		),
	);
}

export interface SidebarTriggerProps extends Record<string, unknown> {
	className?: string;
	onClick?: (event: MouseEvent) => void;
}

export function SidebarTrigger({ className, onClick, ...props }: SidebarTriggerProps) @{
	const { toggleSidebar } = useSidebar();
	<Button
		data-sidebar="trigger"
		data-slot="sidebar-trigger"
		variant="ghost"
		size="icon-sm"
		className={cn('cn-sidebar-trigger', className)}
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

type Props = { className?: string } & Record<string, unknown>;

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
			'cn-sidebar-rail absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] sm:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2',
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
		className={cn('cn-sidebar-inset relative flex w-full flex-1 flex-col', className)}
		{...props}
	/>
}

export function SidebarInput({ className, ...props }: Props) @{
	<Input
		data-slot="sidebar-input"
		data-sidebar="input"
		className={cn('cn-sidebar-input', className)}
		{...props}
	/>
}

export function SidebarHeader({ className, ...props }: Props) @{
	<div
		data-slot="sidebar-header"
		data-sidebar="header"
		className={cn('cn-sidebar-header flex flex-col', className)}
		{...props}
	/>
}

export function SidebarFooter({ className, ...props }: Props) @{
	<div
		data-slot="sidebar-footer"
		data-sidebar="footer"
		className={cn('cn-sidebar-footer flex flex-col', className)}
		{...props}
	/>
}

export function SidebarSeparator({ className, ...props }: Props) @{
	<Separator
		data-slot="sidebar-separator"
		data-sidebar="separator"
		className={cn('cn-sidebar-separator w-auto', className)}
		{...props}
	/>
}

export function SidebarContent({ className, ...props }: Props) @{
	<div
		data-slot="sidebar-content"
		data-sidebar="content"
		className={cn(
			'cn-sidebar-content flex min-h-0 flex-1 flex-col overflow-auto group-data-[collapsible=icon]:overflow-hidden',
			className,
		)}
		{...props}
	/>
}

export function SidebarGroup({ className, ...props }: Props) @{
	<div
		data-slot="sidebar-group"
		data-sidebar="group"
		className={cn('cn-sidebar-group relative flex w-full min-w-0 flex-col', className)}
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
				'cn-sidebar-group-label flex shrink-0 items-center outline-hidden [&>svg]:shrink-0',
				className,
			)}
			{...props}
		/>
	} @else {
		<div
			data-slot="sidebar-group-label"
			data-sidebar="group-label"
			className={cn(
				'cn-sidebar-group-label flex shrink-0 items-center outline-hidden [&>svg]:shrink-0',
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
				'cn-sidebar-group-action flex aspect-square items-center justify-center outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 md:after:hidden [&>svg]:shrink-0',
				className,
			)}
			{...props}
		/>
	} @else {
		<button
			data-slot="sidebar-group-action"
			data-sidebar="group-action"
			className={cn(
				'cn-sidebar-group-action flex aspect-square items-center justify-center outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 md:after:hidden [&>svg]:shrink-0',
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
		className={cn('cn-sidebar-group-content w-full', className)}
		{...props}
	/>
}

export function SidebarMenu({ className, ...props }: Props) @{
	<ul
		data-slot="sidebar-menu"
		data-sidebar="menu"
		className={cn('cn-sidebar-menu flex w-full min-w-0 flex-col', className)}
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
	'cn-sidebar-menu-button peer/menu-button group/menu-button flex w-full items-center overflow-hidden outline-hidden disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate',
	{
		variants: {
			variant: {
				default: 'cn-sidebar-menu-button-variant-default',
				outline: 'cn-sidebar-menu-button-variant-outline',
			},
			size: {
				default: 'cn-sidebar-menu-button-size-default',
				sm: 'cn-sidebar-menu-button-size-sm',
				lg: 'cn-sidebar-menu-button-size-lg',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

export interface SidebarMenuButtonProps extends Record<string, unknown> {
	className?: string;
	// OCTANE DIVERGENCE: asChild composes element descriptors (createElement),
	// not opaque compiled .tsrx children — the documented radix Slot contract.
	asChild?: boolean;
	isActive?: boolean;
	variant?: VariantProps<typeof sidebarMenuButtonVariants>['variant'];
	size?: VariantProps<typeof sidebarMenuButtonVariants>['size'];
	tooltip?: string | Record<string, unknown>;
}

export function SidebarMenuButton({
	asChild = false,
	isActive = false,
	variant = 'default',
	size = 'default',
	tooltip,
	className,
	...props
}: SidebarMenuButtonProps) {
	const { isMobile, state } = useSidebar();

	const button = createElement(asChild ? Slot : 'button', {
		'data-slot': 'sidebar-menu-button',
		'data-sidebar': 'menu-button',
		'data-size': size,
		'data-active': isActive,
		className: cn(sidebarMenuButtonVariants({ variant, size }), className),
		...props,
	});

	if (!tooltip) {
		return button;
	}

	if (typeof tooltip === 'string') {
		tooltip = {
			children: tooltip,
		};
	}

	return createElement(
		Tooltip,
		null,
		createElement(TooltipTrigger, { key: 'trigger', asChild: true }, button),
		createElement(TooltipContent, {
			key: 'content',
			side: 'right',
			align: 'center',
			hidden: state !== 'collapsed' || isMobile,
			...tooltip,
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
				'cn-sidebar-menu-action flex items-center justify-center outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 md:after:hidden [&>svg]:shrink-0',
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
				'cn-sidebar-menu-action flex items-center justify-center outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 md:after:hidden [&>svg]:shrink-0',
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
			'cn-sidebar-menu-badge flex items-center justify-center tabular-nums select-none group-data-[collapsible=icon]:hidden',
			className,
		)}
		{...props}
	/>
}

export function SidebarMenuSkeleton({ className, showIcon = false, ...props }: Props & {
	showIcon?: boolean;
}) @{
	// Random width between 50 to 90%.
	const [width] = useState(() => {
		return `${Math.floor(Math.random() * 40) + 50}%`;
	});
	<div
		data-slot="sidebar-menu-skeleton"
		data-sidebar="menu-skeleton"
		className={cn('cn-sidebar-menu-skeleton flex items-center', className)}
		{...props}
	>
		@if (showIcon) {
			<Skeleton className="cn-sidebar-menu-skeleton-icon" data-sidebar="menu-skeleton-icon" />
		}
		<Skeleton
			className="cn-sidebar-menu-skeleton-text max-w-(--skeleton-width) flex-1"
			data-sidebar="menu-skeleton-text"
			style={{ '--skeleton-width': width }}
		/>
	</div>
}

export function SidebarMenuSub({ className, ...props }: Props) @{
	<ul
		data-slot="sidebar-menu-sub"
		data-sidebar="menu-sub"
		className={cn('cn-sidebar-menu-sub flex min-w-0 flex-col', className)}
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
				'cn-sidebar-menu-sub-button flex min-w-0 -translate-x-px items-center overflow-hidden outline-hidden group-data-[collapsible=icon]:hidden disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:shrink-0',
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
				'cn-sidebar-menu-sub-button flex min-w-0 -translate-x-px items-center overflow-hidden outline-hidden group-data-[collapsible=icon]:hidden disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:shrink-0',
				className,
			)}
			{...props}
		/>
	}
}
