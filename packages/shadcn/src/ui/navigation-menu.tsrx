// NavigationMenu — maintainer-supplied default-Tailwind flavor, class strings
// verbatim. Octane adaptations: lucide-react → @octanejs/lucide, radix-ui →
// @octanejs/radix. Root and Trigger interleave consumer children with sibling
// descriptors, so they use the {props.children} lowering in template JSX.
import type { OctaneNode } from 'octane';
import { cva } from 'class-variance-authority';
import { NavigationMenu as NavigationMenuPrimitive } from '@octanejs/radix';
import { ChevronDownIcon } from '@octanejs/lucide';

import { cn } from '../lib/utils';

type Props = { className?: string; children?: OctaneNode } & Record<string, unknown>;

export function NavigationMenu(props: Props & { viewport?: boolean }) @{
	const { className, children: _children, viewport = true, ...rest } = props;

	<NavigationMenuPrimitive.Root
		data-slot="navigation-menu"
		data-viewport={viewport}
		className={cn(
			'group/navigation-menu relative flex max-w-max flex-1 items-center justify-center',
			className,
		)}
		{...rest}
	>
		{props.children}
		@if (viewport) {
			<NavigationMenuViewport />
		}
	</NavigationMenuPrimitive.Root>
}

export function NavigationMenuList({ className, ...props }: Props) @{
	<NavigationMenuPrimitive.List
		data-slot="navigation-menu-list"
		className={cn('group flex flex-1 list-none items-center justify-center gap-0', className)}
		{...props}
	/>
}

export function NavigationMenuItem({ className, ...props }: Props) @{
	<NavigationMenuPrimitive.Item
		data-slot="navigation-menu-item"
		className={cn('relative', className)}
		{...props}
	/>
}

export const navigationMenuTriggerStyle = cva(
	'group/navigation-menu-trigger inline-flex h-9 w-max items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all outline-none hover:bg-muted focus:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-popup-open:bg-muted/50 data-popup-open:hover:bg-muted data-open:bg-muted/50 data-open:hover:bg-muted data-open:focus:bg-muted',
);

export function NavigationMenuTrigger(props: Props) @{
	const { className, children: _children, ...rest } = props;

	<NavigationMenuPrimitive.Trigger
		data-slot="navigation-menu-trigger"
		className={cn(navigationMenuTriggerStyle(), 'group', className)}
		{...rest}
	>
		{props.children}
		{' '}
		<ChevronDownIcon
			className="relative top-px ml-1 size-3 transition duration-300 group-data-popup-open/navigation-menu-trigger:rotate-180 group-data-open/navigation-menu-trigger:rotate-180"
			aria-hidden="true"
		/>
	</NavigationMenuPrimitive.Trigger>
}

export function NavigationMenuContent({ className, ...props }: Props) @{
	<NavigationMenuPrimitive.Content
		data-slot="navigation-menu-content"
		className={cn(
			'top-0 left-0 w-full p-1 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:mt-1.5 group-data-[viewport=false]/navigation-menu:overflow-hidden group-data-[viewport=false]/navigation-menu:rounded-lg group-data-[viewport=false]/navigation-menu:bg-popover group-data-[viewport=false]/navigation-menu:text-popover-foreground group-data-[viewport=false]/navigation-menu:shadow group-data-[viewport=false]/navigation-menu:ring-1 group-data-[viewport=false]/navigation-menu:ring-foreground/10 group-data-[viewport=false]/navigation-menu:duration-300 data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 data-[motion^=from-]:animate-in data-[motion^=from-]:fade-in data-[motion^=to-]:animate-out data-[motion^=to-]:fade-out **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none md:absolute md:w-auto group-data-[viewport=false]/navigation-menu:data-open:animate-in group-data-[viewport=false]/navigation-menu:data-open:fade-in-0 group-data-[viewport=false]/navigation-menu:data-open:zoom-in-95 group-data-[viewport=false]/navigation-menu:data-closed:animate-out group-data-[viewport=false]/navigation-menu:data-closed:fade-out-0 group-data-[viewport=false]/navigation-menu:data-closed:zoom-out-95',
			className,
		)}
		{...props}
	/>
}

export function NavigationMenuViewport({ className, ...props }: Props) @{
	<div className={cn('absolute top-full left-0 isolate z-50 flex justify-center')}>
		<NavigationMenuPrimitive.Viewport
			data-slot="navigation-menu-viewport"
			className={cn(
				'origin-top-center relative mt-1.5 h-(--radix-navigation-menu-viewport-height) w-full overflow-hidden rounded-lg bg-popover text-popover-foreground shadow ring-1 ring-foreground/10 duration-100 md:w-(--radix-navigation-menu-viewport-width) data-open:animate-in data-open:zoom-in-90 data-closed:animate-out data-closed:zoom-out-90',
				className,
			)}
			{...props}
		/>
	</div>
}

export function NavigationMenuLink({ className, ...props }: Props) @{
	<NavigationMenuPrimitive.Link
		data-slot="navigation-menu-link"
		className={cn(
			'flex items-center gap-2 rounded-lg p-2 text-sm transition-all outline-none hover:bg-muted focus:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 in-data-[slot=navigation-menu-content]:rounded-md data-active:bg-muted/50 data-active:hover:bg-muted data-active:focus:bg-muted [&_svg:not([class*=\'size-\'])]:size-4',
			className,
		)}
		{...props}
	/>
}

export function NavigationMenuIndicator({ className, ...props }: Props) @{
	<NavigationMenuPrimitive.Indicator
		data-slot="navigation-menu-indicator"
		className={cn(
			'top-full z-1 flex h-1.5 items-end justify-center overflow-hidden data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:animate-in data-[state=visible]:fade-in',
			className,
		)}
		{...props}
	>
		<div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md" />
	</NavigationMenuPrimitive.Indicator>
}
