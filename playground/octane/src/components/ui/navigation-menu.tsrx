// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/navigation-menu.tsx. IconPlaceholder
// resolves to lucide (see spinner.tsrx).
//
// NavigationMenu appends the conditional viewport after the consumer's
// children, and NavigationMenuTrigger appends the chevron icon — child
// reordering around opaque compiled .tsrx children needs createElement
// composition (the cmdk Command.Dialog precedent); the consumer's children
// flow through the ordinary props.children channel.
import { createElement, type OctaneNode } from 'octane';
import { cva } from 'class-variance-authority';
import { NavigationMenu as NavigationMenuPrimitive } from '@octanejs/radix';
import { ChevronDownIcon } from '@octanejs/lucide';

import { cn } from '@/lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export function NavigationMenu({ className, children, viewport = true, ...props }: Props & {
	children?: OctaneNode;
	viewport?: boolean;
}) {
	return createElement(
		NavigationMenuPrimitive.Root,
		{
			'data-slot': 'navigation-menu',
			'data-viewport': viewport,
			className: cn(
				'cn-navigation-menu group/navigation-menu relative flex max-w-max flex-1 items-center justify-center',
				className,
			),
			...props,
		},
		children,
		viewport && createElement(NavigationMenuViewport, {}),
	);
}

export function NavigationMenuList({ className, ...props }: Props) @{
	<NavigationMenuPrimitive.List
		data-slot="navigation-menu-list"
		className={cn(
			'cn-navigation-menu-list group flex flex-1 list-none items-center justify-center',
			className,
		)}
		{...props}
	/>
}

export function NavigationMenuItem({ className, ...props }: Props) @{
	<NavigationMenuPrimitive.Item
		data-slot="navigation-menu-item"
		className={cn('cn-navigation-menu-item relative', className)}
		{...props}
	/>
}

export const navigationMenuTriggerStyle = cva(
	'cn-navigation-menu-trigger group/navigation-menu-trigger inline-flex h-9 w-max items-center justify-center outline-none disabled:pointer-events-none',
);

export function NavigationMenuTrigger({ className, children, ...props }: Props & {
	children?: OctaneNode;
}) {
	return createElement(
		NavigationMenuPrimitive.Trigger,
		{
			'data-slot': 'navigation-menu-trigger',
			className: cn(navigationMenuTriggerStyle(), 'group', className),
			...props,
		},
		children,
		' ',
		createElement(ChevronDownIcon, {
			className: 'cn-navigation-menu-trigger-icon',
			'aria-hidden': 'true',
		}),
	);
}

export function NavigationMenuContent({ className, ...props }: Props) @{
	<NavigationMenuPrimitive.Content
		data-slot="navigation-menu-content"
		className={cn(
			'cn-navigation-menu-content top-0 left-0 w-full group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:mt-1.5 group-data-[viewport=false]/navigation-menu:overflow-hidden **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none md:absolute md:w-auto',
			className,
		)}
		{...props}
	/>
}

export function NavigationMenuViewport({ className, ...props }: Props) @{
	<div
		className={cn(
			'cn-navigation-menu-viewport-wrapper absolute top-full left-0 isolate z-50 flex justify-center',
		)}
	>
		<NavigationMenuPrimitive.Viewport
			data-slot="navigation-menu-viewport"
			className={cn(
				'cn-navigation-menu-viewport origin-top-center relative mt-1.5 h-(--radix-navigation-menu-viewport-height) w-full overflow-hidden md:w-(--radix-navigation-menu-viewport-width)',
				className,
			)}
			{...props}
		/>
	</div>
}

export function NavigationMenuLink({ className, ...props }: Props) @{
	<NavigationMenuPrimitive.Link
		data-slot="navigation-menu-link"
		className={cn('cn-navigation-menu-link', className)}
		{...props}
	/>
}

export function NavigationMenuIndicator({ className, ...props }: Props) @{
	<NavigationMenuPrimitive.Indicator
		data-slot="navigation-menu-indicator"
		className={cn(
			'cn-navigation-menu-indicator top-full z-1 flex h-1.5 items-end justify-center overflow-hidden',
			className,
		)}
		{...props}
	>
		<div className="cn-navigation-menu-indicator-arrow relative top-[60%] h-2 w-2 rotate-45" />
	</NavigationMenuPrimitive.Indicator>
}
