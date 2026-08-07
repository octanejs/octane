// Base UI base dropdown-menu — runs on @octanejs/base-ui's `Menu`. Class strings come from the
// maintainer-supplied radix source; every difference below was verified by rendering the primitive
// and reading the DOM, not inferred.
//
// PART TREE. Radix's `Content` is one element; Base UI splits positioning out, exactly as this
// base's popover already does:
//
//     radix     Root > Portal > Content
//     Base UI   Root > Portal > Positioner > Popup      (Positioner owns align/sideOffset)
//
// THREE CSS VARIABLES ARE RENAMED. Radix publishes per-component names; Base UI's Positioner
// publishes generic ones, and a utility pointing at a variable nothing sets silently does nothing:
//
//     --radix-dropdown-menu-content-available-height  ->  --available-height
//     --radix-dropdown-menu-trigger-width             ->  --anchor-width
//     --radix-dropdown-menu-content-transform-origin  ->  --transform-origin
//
// THE SUBMENU TRIGGER'S OPEN ATTRIBUTE DIFFERS. Base UI marks an open trigger with
// `data-popup-open` (triggerOpenStateMapping), not the `data-open` the popup itself carries — so
// radix's `data-open:bg-accent` on the sub-trigger would never match and an open submenu's parent
// row would not stay highlighted.
//
// WHAT DOES CARRY OVER UNCHANGED, and is worth recording because it looks like it should not:
// radix styles item highlight with `focus:`, which works here because Base UI moves REAL DOM focus
// onto the highlighted item (checked by driving ArrowDown and reading document.activeElement) as
// well as publishing `data-highlighted`. `data-side`, `data-align`, `data-open`, `data-closed` and
// `data-disabled` are all emitted with the same spellings radix uses.
//
// TWO PARTS ARE PLAIN HOST ELEMENTS ON PURPOSE:
//   - `Label` is a `<div>`, NOT `Menu.GroupLabel`. That part calls useMenuGroupRootContext and
//     THROWS "MenuGroupContext is missing" outside a `Menu.Group`, while shadcn's label is
//     routinely used standalone. Same trap as `Field.Label`, which already shipped as a crash once.
//   - `Separator` is a `<div>`, because the Menu namespace has no Separator part at all (its
//     sibling ContextMenu does). The radix classes are pure styling, so nothing is lost.
// POSITIONING PROPS BELONG TO THE POSITIONER, NOT THE POPUP. Radix has one `Content` element that
// takes them all; Base UI splits positioning into its own layer, so anything forwarded to `Popup`
// instead is inert — `side="top"` silently leaves the menu on the default side, and both `side` and
// `alignOffset` land on the DOM as invalid attributes. They are therefore destructured and routed
// explicitly rather than swept up by the rest spread.
import { type OctaneNode } from 'octane';
import { Menu as MenuPrimitive } from '@octanejs/base-ui/menu';
import { CheckIcon, ChevronRightIcon } from '@octanejs/lucide';

import { cn } from '../../../lib/utils';

type Props = { className?: string; children?: OctaneNode } & Record<string, unknown>;

export function DropdownMenu(props: Record<string, unknown>) @{
	<MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

export function DropdownMenuPortal(props: Record<string, unknown>) @{
	<MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

export function DropdownMenuTrigger(props: Record<string, unknown>) @{
	<MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

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

export interface DropdownMenuContentProps extends Props, BaseUiPositioningProps {}

export function DropdownMenuContent({
	className,
	align = 'start',
	sideOffset = 4,
	side,
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
}: DropdownMenuContentProps) @{
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
				data-slot="dropdown-menu-content"
				className={cn(
					'z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-closed:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
					className,
				)}
				{...props}
			/>
		</MenuPrimitive.Positioner>
	</MenuPrimitive.Portal>
}

export function DropdownMenuGroup(props: Record<string, unknown>) @{
	<MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

export function DropdownMenuItem({ className, inset, variant = 'default', ...props }: Props & {
	inset?: boolean;
	variant?: 'default' | 'destructive';
}) @{
	<MenuPrimitive.Item
		data-slot="dropdown-menu-item"
		data-inset={inset}
		data-variant={variant}
		className={cn(
			'group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive',
			className,
		)}
		{...props}
	/>
}

export function DropdownMenuCheckboxItem(props: Props & {
	checked?: boolean;
	inset?: boolean;
}) @{
	const { className, children: _children, checked, inset, ...rest } = props;

	<MenuPrimitive.CheckboxItem
		data-slot="dropdown-menu-checkbox-item"
		data-inset={inset}
		className={cn(
			'relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
			className,
		)}
		checked={checked}
		{...rest}
	>
		<span
			className="pointer-events-none absolute right-2 flex items-center justify-center"
			data-slot="dropdown-menu-checkbox-item-indicator"
		>
			<MenuPrimitive.CheckboxItemIndicator>
				<CheckIcon />
			</MenuPrimitive.CheckboxItemIndicator>
		</span>
		{props.children}
	</MenuPrimitive.CheckboxItem>
}

export function DropdownMenuRadioGroup(props: Record<string, unknown>) @{
	<MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

export function DropdownMenuRadioItem(props: Props & { inset?: boolean }) @{
	const { className, children: _children, inset, ...rest } = props;

	<MenuPrimitive.RadioItem
		data-slot="dropdown-menu-radio-item"
		data-inset={inset}
		className={cn(
			'relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
			className,
		)}
		{...rest}
	>
		<span
			className="pointer-events-none absolute right-2 flex items-center justify-center"
			data-slot="dropdown-menu-radio-item-indicator"
		>
			<MenuPrimitive.RadioItemIndicator>
				<CheckIcon />
			</MenuPrimitive.RadioItemIndicator>
		</span>
		{props.children}
	</MenuPrimitive.RadioItem>
}

export function DropdownMenuLabel({ className, inset, ...props }: Props & { inset?: boolean }) @{
	<div
		data-slot="dropdown-menu-label"
		data-inset={inset}
		className={cn(
			'px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7',
			className,
		)}
		{...props}
	/>
}

export function DropdownMenuSeparator({ className, ...props }: Props) @{
	<div
		role="separator"
		aria-orientation="horizontal"
		data-slot="dropdown-menu-separator"
		className={cn('-mx-1 my-1 h-px bg-border', className)}
		{...props}
	/>
}

export function DropdownMenuShortcut({ className, ...props }: Props) @{
	<span
		data-slot="dropdown-menu-shortcut"
		className={cn(
			'ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground',
			className,
		)}
		{...props}
	/>
}

export function DropdownMenuSub(props: Record<string, unknown>) @{
	<MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

export function DropdownMenuSubTrigger(props: Props & { inset?: boolean }) @{
	const { className, children: _children, inset, ...rest } = props;

	<MenuPrimitive.SubmenuTrigger
		data-slot="dropdown-menu-sub-trigger"
		data-inset={inset}
		className={cn(
			'flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-popup-open:bg-accent data-popup-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
			className,
		)}
		{...rest}
	>
		{props.children}
		<ChevronRightIcon className="cn-rtl-flip ml-auto" />
	</MenuPrimitive.SubmenuTrigger>
}

export function DropdownMenuSubContent({
	className,
	align,
	sideOffset,
	side,
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
				data-slot="dropdown-menu-sub-content"
				className={cn(
					'z-50 min-w-[96px] origin-(--transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
					className,
				)}
				{...props}
			/>
		</MenuPrimitive.Positioner>
	</MenuPrimitive.Portal>
}
