// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/context-menu.tsx (the `"use client"`
// directive is dropped — octane has no RSC axis). IconPlaceholder resolves to
// lucide (see spinner.tsrx).
//
// ContextMenuContent wraps Portal+Content, and the checkbox/radio/sub-trigger
// items compose an indicator/chevron with the consumer's children — radix's
// Portal (Slot) and any child reordering need real element DESCRIPTORS, so
// those parts are composed with createElement (the cmdk Command.Dialog
// precedent); the consumer's children flow through the ordinary props.children
// channel.
import { createElement, type OctaneNode } from 'octane';
import { ContextMenu as ContextMenuPrimitive } from '@octanejs/radix';
import { CheckIcon, ChevronRightIcon } from '@octanejs/lucide';

import { cn } from '@/lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export function ContextMenu(props: Record<string, unknown>) @{
	<ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

export function ContextMenuTrigger({ className, ...props }: Props) @{
	<ContextMenuPrimitive.Trigger
		data-slot="context-menu-trigger"
		className={cn('cn-context-menu-trigger select-none', className)}
		{...props}
	/>
}

export function ContextMenuGroup(props: Record<string, unknown>) @{
	<ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
}

// OCTANE DIVERGENCE: radix's Portal slots its child, which requires a real
// element descriptor — opaque compiled .tsrx children are not accepted here.
// Compose Portal children with createElement (see ContextMenuContent).
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
				'cn-context-menu-content cn-menu-target cn-menu-translucent z-50 max-h-(--radix-context-menu-content-available-height) origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto',
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
			'cn-context-menu-item group/context-menu-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
			className,
		)}
		{...props}
	/>
}

export function ContextMenuSubTrigger({ className, inset, children, ...props }: Props & {
	inset?: boolean;
	children?: OctaneNode;
}) {
	return createElement(
		ContextMenuPrimitive.SubTrigger,
		{
			'data-slot': 'context-menu-sub-trigger',
			'data-inset': inset,
			className: cn(
				'cn-context-menu-sub-trigger flex cursor-default items-center outline-hidden select-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
				className,
			),
			...props,
		},
		children,
		createElement(ChevronRightIcon, { className: 'cn-rtl-flip ml-auto' }),
	);
}

export function ContextMenuSubContent({ className, ...props }: Props) @{
	<ContextMenuPrimitive.SubContent
		data-slot="context-menu-sub-content"
		className={cn(
			'cn-context-menu-sub-content cn-menu-target cn-menu-translucent z-50 origin-(--radix-context-menu-content-transform-origin) overflow-hidden',
			className,
		)}
		{...props}
	/>
}

export function ContextMenuCheckboxItem({ className, children, checked, inset, ...props }: Props & {
	children?: OctaneNode;
	checked?: boolean | 'indeterminate';
	inset?: boolean;
}) {
	return createElement(
		ContextMenuPrimitive.CheckboxItem,
		{
			'data-slot': 'context-menu-checkbox-item',
			'data-inset': inset,
			className: cn(
				'cn-context-menu-checkbox-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
				className,
			),
			checked,
			...props,
		},
		createElement(
			'span',
			{ className: 'cn-context-menu-item-indicator pointer-events-none' },
			createElement(ContextMenuPrimitive.ItemIndicator, null, createElement(CheckIcon, {})),
		),
		children,
	);
}

export function ContextMenuRadioItem({ className, children, inset, ...props }: Props & {
	children?: OctaneNode;
	inset?: boolean;
}) {
	return createElement(
		ContextMenuPrimitive.RadioItem,
		{
			'data-slot': 'context-menu-radio-item',
			'data-inset': inset,
			className: cn(
				'cn-context-menu-radio-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
				className,
			),
			...props,
		},
		createElement(
			'span',
			{ className: 'cn-context-menu-item-indicator pointer-events-none' },
			createElement(ContextMenuPrimitive.ItemIndicator, null, createElement(CheckIcon, {})),
		),
		children,
	);
}

export function ContextMenuLabel({ className, inset, ...props }: Props & { inset?: boolean }) @{
	<ContextMenuPrimitive.Label
		data-slot="context-menu-label"
		data-inset={inset}
		className={cn('cn-context-menu-label', className)}
		{...props}
	/>
}

export function ContextMenuSeparator({ className, ...props }: Props) @{
	<ContextMenuPrimitive.Separator
		data-slot="context-menu-separator"
		className={cn('cn-context-menu-separator', className)}
		{...props}
	/>
}

export function ContextMenuShortcut({ className, ...props }: Props) @{
	<span
		data-slot="context-menu-shortcut"
		className={cn('cn-context-menu-shortcut', className)}
		{...props}
	/>
}
