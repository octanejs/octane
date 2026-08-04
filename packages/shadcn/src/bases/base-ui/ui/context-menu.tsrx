// Base UI base context-menu — runs on @octanejs/base-ui's `ContextMenu`. Class strings from the
// maintainer-supplied radix source; every difference below was checked against rendered DOM.
//
// This is dropdown-menu's sibling and inherits its findings, WITH ONE IMPROVEMENT: `ContextMenu`
// ships a real `Separator` part, which `Menu` does not, so the separator is the primitive here
// rather than a plain host element. It emits `role="separator"`, `aria-orientation` and
// `data-orientation`.
//
// CARRIED OVER FROM dropdown-menu, all re-verified against this primitive:
//   - Two CSS variables are renamed. Radix publishes per-component names; Base UI's Positioner
//     publishes generic ones, and a utility naming a variable nothing sets does nothing, silently:
//         --radix-context-menu-content-available-height  ->  --available-height
//         --radix-context-menu-content-transform-origin  ->  --transform-origin
//   - The submenu trigger marks itself open with `data-popup-open`, not the `data-open` the popup
//     carries, so radix's `data-open:bg-accent` would leave an open submenu's parent row unstyled.
//   - `Label` stays a plain `<div>`: `ContextMenu.GroupLabel` requires a `ContextMenu.Group`
//     ancestor and throws without one, while shadcn's label is used standalone.
//   - Radix's `focus:` item utilities carry over unchanged, because Base UI moves real DOM focus
//     onto the highlighted item as well as publishing `data-highlighted`.
//
// POSITIONING PROPS GO TO THE POSITIONER, NOT THE POPUP. Radix has one `Content` element that takes
// them all; Base UI splits positioning into its own layer, so anything swept onto `Popup` by a rest
// spread is inert — `side="top"` would silently leave the menu on its default side and also land on
// the DOM as an invalid attribute. They are destructured and forwarded explicitly.
import { type OctaneNode } from 'octane';
import { ContextMenu as ContextMenuPrimitive } from '@octanejs/base-ui/context-menu';
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

export function ContextMenu(props: Record<string, unknown>) @{
	<ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

export function ContextMenuTrigger({ className, ...props }: Props) @{
	<ContextMenuPrimitive.Trigger
		data-slot="context-menu-trigger"
		className={cn('select-none', className)}
		{...props}
	/>
}

export function ContextMenuGroup(props: Record<string, unknown>) @{
	<ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
}

export function ContextMenuPortal(props: Record<string, unknown>) @{
	<ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
}

export function ContextMenuSub(props: Record<string, unknown>) @{
	<ContextMenuPrimitive.SubmenuRoot data-slot="context-menu-sub" {...props} />
}

export function ContextMenuRadioGroup(props: Record<string, unknown>) @{
	<ContextMenuPrimitive.RadioGroup data-slot="context-menu-radio-group" {...props} />
}

export function ContextMenuContent({
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
	<ContextMenuPrimitive.Portal>
		<ContextMenuPrimitive.Positioner
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
			<ContextMenuPrimitive.Popup
				data-slot="context-menu-content"
				className={cn(
					'z-50 max-h-(--available-height) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
					className,
				)}
				{...props}
			/>
		</ContextMenuPrimitive.Positioner>
	</ContextMenuPrimitive.Portal>
}

export function ContextMenuItem({ className, inset, variant = 'default', ...props }: Props & {
	inset?: boolean;
	variant?: 'default' | 'destructive';
}) @{
	<ContextMenuPrimitive.Item
		data-slot="context-menu-item"
		data-inset={inset}
		data-variant={variant}
		className={cn(
			'group/context-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4 focus:*:[svg]:text-accent-foreground data-[variant=destructive]:*:[svg]:text-destructive',
			className,
		)}
		{...props}
	/>
}

export function ContextMenuSubTrigger(props: Props & { inset?: boolean }) @{
	const { className, children: _children, inset, ...rest } = props;

	<ContextMenuPrimitive.SubmenuTrigger
		data-slot="context-menu-sub-trigger"
		data-inset={inset}
		className={cn(
			'flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-popup-open:bg-accent data-popup-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
			className,
		)}
		{...rest}
	>
		{props.children}
		<ChevronRightIcon className="cn-rtl-flip ml-auto" />
	</ContextMenuPrimitive.SubmenuTrigger>
}

export function ContextMenuSubContent({
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
	<ContextMenuPrimitive.Portal>
		<ContextMenuPrimitive.Positioner
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
			<ContextMenuPrimitive.Popup
				data-slot="context-menu-sub-content"
				className={cn(
					'z-50 min-w-32 origin-(--transform-origin) overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
					className,
				)}
				{...props}
			/>
		</ContextMenuPrimitive.Positioner>
	</ContextMenuPrimitive.Portal>
}

export function ContextMenuCheckboxItem(props: Props & {
	checked?: boolean;
	inset?: boolean;
}) @{
	const { className, children: _children, checked, inset, ...rest } = props;

	<ContextMenuPrimitive.CheckboxItem
		data-slot="context-menu-checkbox-item"
		data-inset={inset}
		className={cn(
			'relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
			className,
		)}
		checked={checked}
		{...rest}
	>
		<span
			className="pointer-events-none absolute right-2 flex items-center justify-center"
			data-slot="context-menu-checkbox-item-indicator"
		>
			<ContextMenuPrimitive.CheckboxItemIndicator>
				<CheckIcon />
			</ContextMenuPrimitive.CheckboxItemIndicator>
		</span>
		{props.children}
	</ContextMenuPrimitive.CheckboxItem>
}

export function ContextMenuRadioItem(props: Props & { inset?: boolean }) @{
	const { className, children: _children, inset, ...rest } = props;

	<ContextMenuPrimitive.RadioItem
		data-slot="context-menu-radio-item"
		data-inset={inset}
		className={cn(
			'relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
			className,
		)}
		{...rest}
	>
		<span
			className="pointer-events-none absolute right-2 flex items-center justify-center"
			data-slot="context-menu-radio-item-indicator"
		>
			<ContextMenuPrimitive.RadioItemIndicator>
				<CheckIcon />
			</ContextMenuPrimitive.RadioItemIndicator>
		</span>
		{props.children}
	</ContextMenuPrimitive.RadioItem>
}

export function ContextMenuLabel({ className, inset, ...props }: Props & { inset?: boolean }) @{
	<div
		data-slot="context-menu-label"
		data-inset={inset}
		className={cn(
			'px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7',
			className,
		)}
		{...props}
	/>
}

export function ContextMenuSeparator({ className, ...props }: Props) @{
	<ContextMenuPrimitive.Separator
		data-slot="context-menu-separator"
		className={cn('-mx-1 my-1 h-px bg-border', className)}
		{...props}
	/>
}

export function ContextMenuShortcut({ className, ...props }: Props) @{
	<span
		data-slot="context-menu-shortcut"
		className={cn(
			'ml-auto text-xs tracking-widest text-muted-foreground group-focus/context-menu-item:text-accent-foreground',
			className,
		)}
		{...props}
	/>
}
