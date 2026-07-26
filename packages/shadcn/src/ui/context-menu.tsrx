// ContextMenu — maintainer-supplied default-Tailwind flavor, class strings
// verbatim. Octane adaptations: "use client" dropped, lucide-react →
// @octanejs/lucide, radix-ui → @octanejs/radix. Content composes its Portal
// subtree with createElement (radix's Portal slots its child); parts that
// interleave consumer children with sibling descriptors use the
// {props.children} lowering in template JSX.
import { createElement, type OctaneNode } from 'octane';
import { ContextMenu as ContextMenuPrimitive } from '@octanejs/radix';
import { CheckIcon, ChevronRightIcon } from '@octanejs/lucide';

import { cn } from '../lib/utils';

type Props = { className?: string; children?: OctaneNode } & Record<string, unknown>;

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
	<ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
}

export function ContextMenuRadioGroup(props: Record<string, unknown>) @{
	<ContextMenuPrimitive.RadioGroup data-slot="context-menu-radio-group" {...props} />
}

export function ContextMenuContent({ className, ...props }: Props & {
	side?: 'top' | 'right' | 'bottom' | 'left';
}) {
	return createElement(
		ContextMenuPrimitive.Portal,
		null,
		createElement(ContextMenuPrimitive.Content, {
			'data-slot': 'context-menu-content',
			className: cn(
				'z-50 max-h-(--radix-context-menu-content-available-height) min-w-36 origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
				className,
			),
			...props,
		}),
	);
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

	<ContextMenuPrimitive.SubTrigger
		data-slot="context-menu-sub-trigger"
		data-inset={inset}
		className={cn(
			'flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-inset:pl-7 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
			className,
		)}
		{...rest}
	>
		{props.children}
		<ChevronRightIcon className="cn-rtl-flip ml-auto" />
	</ContextMenuPrimitive.SubTrigger>
}

export function ContextMenuSubContent({ className, ...props }: Props) @{
	<ContextMenuPrimitive.SubContent
		data-slot="context-menu-sub-content"
		className={cn(
			'z-50 min-w-32 origin-(--radix-context-menu-content-transform-origin) overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
			className,
		)}
		{...props}
	/>
}

export function ContextMenuCheckboxItem(props: Props & {
	checked?: boolean | 'indeterminate';
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
		<span className="pointer-events-none absolute right-2">
			<ContextMenuPrimitive.ItemIndicator>
				<CheckIcon />
			</ContextMenuPrimitive.ItemIndicator>
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
		<span className="pointer-events-none absolute right-2">
			<ContextMenuPrimitive.ItemIndicator>
				<CheckIcon />
			</ContextMenuPrimitive.ItemIndicator>
		</span>
		{props.children}
	</ContextMenuPrimitive.RadioItem>
}

export function ContextMenuLabel({ className, inset, ...props }: Props & { inset?: boolean }) @{
	<ContextMenuPrimitive.Label
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
