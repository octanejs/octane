// DropdownMenu — maintainer-supplied default-Tailwind flavor, class strings
// verbatim. Octane adaptations: "use client" dropped, lucide-react →
// @octanejs/lucide, radix-ui → @octanejs/radix. Content composes its Portal
// subtree with createElement (radix's Portal slots its child, so the child must
// be a real element descriptor); the parts that interleave consumer children
// with sibling descriptors use the {props.children} lowering in template JSX.
import { createElement, type OctaneNode } from 'octane';
import { DropdownMenu as DropdownMenuPrimitive } from '@octanejs/radix';
import { CheckIcon, ChevronRightIcon } from '@octanejs/lucide';

import { cn } from '../../../lib/utils';

type Props = { className?: string; children?: OctaneNode } & Record<string, unknown>;

export function DropdownMenu(props: Record<string, unknown>) @{
	<DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

export function DropdownMenuPortal(props: Record<string, unknown>) @{
	<DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

export function DropdownMenuTrigger(props: Record<string, unknown>) @{
	<DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

export function DropdownMenuContent({
	className,
	align = 'start',
	sideOffset = 4,
	...props
}: Props & {
	align?: string;
	sideOffset?: number;
}) {
	return createElement(
		DropdownMenuPrimitive.Portal,
		null,
		createElement(DropdownMenuPrimitive.Content, {
			'data-slot': 'dropdown-menu-content',
			sideOffset,
			align,
			className: cn(
				'z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
				className,
			),
			...props,
		}),
	);
}

export function DropdownMenuGroup(props: Record<string, unknown>) @{
	<DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

export function DropdownMenuItem({ className, inset, variant = 'default', ...props }: Props & {
	inset?: boolean;
	variant?: 'default' | 'destructive';
}) @{
	<DropdownMenuPrimitive.Item
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
	checked?: boolean | 'indeterminate';
	inset?: boolean;
}) @{
	const { className, children: _children, checked, inset, ...rest } = props;

	<DropdownMenuPrimitive.CheckboxItem
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
			<DropdownMenuPrimitive.ItemIndicator>
				<CheckIcon />
			</DropdownMenuPrimitive.ItemIndicator>
		</span>
		{props.children}
	</DropdownMenuPrimitive.CheckboxItem>
}

export function DropdownMenuRadioGroup(props: Record<string, unknown>) @{
	<DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

export function DropdownMenuRadioItem(props: Props & { inset?: boolean }) @{
	const { className, children: _children, inset, ...rest } = props;

	<DropdownMenuPrimitive.RadioItem
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
			<DropdownMenuPrimitive.ItemIndicator>
				<CheckIcon />
			</DropdownMenuPrimitive.ItemIndicator>
		</span>
		{props.children}
	</DropdownMenuPrimitive.RadioItem>
}

export function DropdownMenuLabel({ className, inset, ...props }: Props & { inset?: boolean }) @{
	<DropdownMenuPrimitive.Label
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
	<DropdownMenuPrimitive.Separator
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
	<DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

export function DropdownMenuSubTrigger(props: Props & { inset?: boolean }) @{
	const { className, children: _children, inset, ...rest } = props;

	<DropdownMenuPrimitive.SubTrigger
		data-slot="dropdown-menu-sub-trigger"
		data-inset={inset}
		className={cn(
			'flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
			className,
		)}
		{...rest}
	>
		{props.children}
		<ChevronRightIcon className="cn-rtl-flip ml-auto" />
	</DropdownMenuPrimitive.SubTrigger>
}

export function DropdownMenuSubContent({ className, ...props }: Props) @{
	<DropdownMenuPrimitive.SubContent
		data-slot="dropdown-menu-sub-content"
		className={cn(
			'z-50 min-w-[96px] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
			className,
		)}
		{...props}
	/>
}
