// Base UI base menubar — the bar runs on @octanejs/base-ui's `Menubar`, and every menu inside it
// runs on `Menu`, the same primitive `dropdown-menu` uses. Class strings from the maintainer-supplied
// radix source.
//
// PART MAPPING. Radix nests the whole family under one `Menubar` namespace; Base UI has a `Menubar`
// component for the bar ONLY, and the menus are ordinary `Menu` parts:
//
//     radix     Menubar.Root / .Menu / .Trigger / .Content / .Item / .Sub / …
//     Base UI   Menubar   +   Menu.Root / .Trigger / .Portal > .Positioner > .Popup / .Item / …
//
// CARRIED OVER FROM dropdown-menu, re-verified against this composition:
//   - `--radix-menubar-content-transform-origin` -> `--transform-origin`. A utility naming a
//     variable nothing sets does nothing, silently.
//   - The SUBMENU trigger marks itself open with `data-popup-open`, not the `data-open` the popup
//     carries, so radix's `data-open:bg-accent` there would never match.
//   - `Label` and `Separator` are plain host elements: `Menu.GroupLabel` throws outside a
//     `Menu.Group` while shadcn's label is standalone, and the `Menu` namespace ships no Separator
//     part at all (its sibling `ContextMenu` does).
//   - Radix's `focus:` item utilities carry over, because Base UI moves real DOM focus onto the
//     highlighted item.
//   - Positioning props are routed to the Positioner, not swept onto the Popup where they are inert.
//
// THE BAR TRIGGER IS THE ONE PLACE THIS FAMILY DIFFERS from the dropdown. Its radix class keys off
// `aria-expanded:bg-muted` rather than a data attribute, and that carries over UNCHANGED — Base UI's
// trigger publishes `aria-expanded="true"` when its menu is open (verified by rendering). So the
// `data-popup-open` rewrite above applies only to the submenu trigger, not to this one.
import { type OctaneNode } from 'octane';
import { Menubar as MenubarPrimitive } from '@octanejs/base-ui/menubar';
import { Menu as MenuPrimitive } from '@octanejs/base-ui/menu';
import { CheckIcon, ChevronRightIcon } from '@octanejs/lucide';

import { cn } from '../../../lib/utils';

type Props = { className?: string; children?: OctaneNode } & Record<string, unknown>;

export interface BaseUiPositioningProps {
	/** Forwarded to the Positioner; see the note at the top of this file. */
	side?: 'top' | 'right' | 'bottom' | 'left';
	sideOffset?: number;
	align?: 'start' | 'center' | 'end';
	alignOffset?: number;
	anchor?: unknown;
	positionMethod?: 'absolute' | 'fixed';
	collisionBoundary?: unknown;
	collisionPadding?: unknown;
	collisionAvoidance?: unknown;
	arrowPadding?: number;
	sticky?: boolean;
	disableAnchorTracking?: boolean;
}

export function Menubar({ className, ...props }: Props) @{
	<MenubarPrimitive
		data-slot="menubar"
		className={cn('flex h-8 items-center gap-0.5 rounded-lg border p-[3px]', className)}
		{...props}
	/>
}

export function MenubarMenu(props: Record<string, unknown>) @{
	<MenuPrimitive.Root data-slot="menubar-menu" {...props} />
}

export function MenubarGroup(props: Record<string, unknown>) @{
	<MenuPrimitive.Group data-slot="menubar-group" {...props} />
}

export function MenubarPortal(props: Record<string, unknown>) @{
	<MenuPrimitive.Portal data-slot="menubar-portal" {...props} />
}

export function MenubarRadioGroup(props: Record<string, unknown>) @{
	<MenuPrimitive.RadioGroup data-slot="menubar-radio-group" {...props} />
}

export function MenubarTrigger({ className, ...props }: Props) @{
	<MenuPrimitive.Trigger
		data-slot="menubar-trigger"
		className={cn(
			'flex items-center rounded-sm px-1.5 py-[2px] text-sm font-medium outline-hidden select-none hover:bg-muted aria-expanded:bg-muted',
			className,
		)}
		{...props}
	/>
}

export function MenubarContent({
	className,
	align = 'start',
	alignOffset = -4,
	sideOffset = 8,
	side,
	anchor,
	positionMethod,
	collisionBoundary,
	collisionPadding,
	collisionAvoidance,
	arrowPadding,
	sticky,
	disableAnchorTracking,
	...props
}: Props & BaseUiPositioningProps) @{
	<MenuPrimitive.Portal>
		<MenuPrimitive.Positioner
			align={align}
			alignOffset={alignOffset}
			sideOffset={sideOffset}
			side={side}
			anchor={anchor}
			positionMethod={positionMethod}
			collisionBoundary={collisionBoundary}
			collisionPadding={collisionPadding}
			collisionAvoidance={collisionAvoidance}
			arrowPadding={arrowPadding}
			sticky={sticky}
			disableAnchorTracking={disableAnchorTracking}
		>
			<MenuPrimitive.Popup
				data-slot="menubar-content"
				className={cn(
					'z-50 min-w-36 origin-(--transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
					className,
				)}
				{...props}
			/>
		</MenuPrimitive.Positioner>
	</MenuPrimitive.Portal>
}

export function MenubarItem({ className, inset, variant = 'default', ...props }: Props & {
	inset?: boolean;
	variant?: 'default' | 'destructive';
}) @{
	<MenuPrimitive.Item
		data-slot="menubar-item"
		data-inset={inset}
		data-variant={variant}
		className={cn(
			'group/menubar-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive!',
			className,
		)}
		{...props}
	/>
}

export function MenubarCheckboxItem(props: Props & {
	checked?: boolean;
	inset?: boolean;
}) @{
	const { className, children: _children, checked, inset, ...rest } = props;

	<MenuPrimitive.CheckboxItem
		data-slot="menubar-checkbox-item"
		data-inset={inset}
		className={cn(
			'relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-1.5 pl-7 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
			className,
		)}
		checked={checked}
		{...rest}
	>
		<span
			className="pointer-events-none absolute left-1.5 flex size-4 items-center justify-center [&_svg:not([class*='size-'])]:size-4"
		>
			<MenuPrimitive.CheckboxItemIndicator>
				<CheckIcon />
			</MenuPrimitive.CheckboxItemIndicator>
		</span>
		{props.children}
	</MenuPrimitive.CheckboxItem>
}

export function MenubarRadioItem(props: Props & { inset?: boolean }) @{
	const { className, children: _children, inset, ...rest } = props;

	<MenuPrimitive.RadioItem
		data-slot="menubar-radio-item"
		data-inset={inset}
		className={cn(
			'relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-1.5 pl-7 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
			className,
		)}
		{...rest}
	>
		<span
			className="pointer-events-none absolute left-1.5 flex size-4 items-center justify-center [&_svg:not([class*='size-'])]:size-4"
		>
			<MenuPrimitive.RadioItemIndicator>
				<CheckIcon />
			</MenuPrimitive.RadioItemIndicator>
		</span>
		{props.children}
	</MenuPrimitive.RadioItem>
}

export function MenubarLabel({ className, inset, ...props }: Props & { inset?: boolean }) @{
	<div
		data-slot="menubar-label"
		data-inset={inset}
		className={cn('px-1.5 py-1 text-sm font-medium data-inset:pl-7', className)}
		{...props}
	/>
}

export function MenubarSeparator({ className, ...props }: Props) @{
	<div
		role="separator"
		aria-orientation="horizontal"
		data-slot="menubar-separator"
		className={cn('-mx-1 my-1 h-px bg-border', className)}
		{...props}
	/>
}

export function MenubarShortcut({ className, ...props }: Props) @{
	<span
		data-slot="menubar-shortcut"
		className={cn(
			'ml-auto text-xs tracking-widest text-muted-foreground group-focus/menubar-item:text-accent-foreground',
			className,
		)}
		{...props}
	/>
}

export function MenubarSub(props: Record<string, unknown>) @{
	<MenuPrimitive.SubmenuRoot data-slot="menubar-sub" {...props} />
}

export function MenubarSubTrigger(props: Props & { inset?: boolean }) @{
	const { className, children: _children, inset, ...rest } = props;

	<MenuPrimitive.SubmenuTrigger
		data-slot="menubar-sub-trigger"
		data-inset={inset}
		className={cn(
			'flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-popup-open:bg-accent data-popup-open:text-accent-foreground [&_svg:not([class*=\'size-\'])]:size-4',
			className,
		)}
		{...rest}
	>
		{props.children}
		<ChevronRightIcon className="cn-rtl-flip ml-auto" />
	</MenuPrimitive.SubmenuTrigger>
}

export function MenubarSubContent({
	className,
	side,
	sideOffset,
	align,
	alignOffset,
	anchor,
	positionMethod,
	collisionBoundary,
	collisionPadding,
	collisionAvoidance,
	arrowPadding,
	sticky,
	disableAnchorTracking,
	...props
}: Props & BaseUiPositioningProps) @{
	<MenuPrimitive.Portal>
		<MenuPrimitive.Positioner
			side={side}
			sideOffset={sideOffset}
			align={align}
			alignOffset={alignOffset}
			anchor={anchor}
			positionMethod={positionMethod}
			collisionBoundary={collisionBoundary}
			collisionPadding={collisionPadding}
			collisionAvoidance={collisionAvoidance}
			arrowPadding={arrowPadding}
			sticky={sticky}
			disableAnchorTracking={disableAnchorTracking}
		>
			<MenuPrimitive.Popup
				data-slot="menubar-sub-content"
				className={cn(
					'z-50 min-w-32 origin-(--transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
					className,
				)}
				{...props}
			/>
		</MenuPrimitive.Positioner>
	</MenuPrimitive.Portal>
}
