// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/dropdown-menu.tsx (the `"use client"`
// directive is dropped — octane has no RSC axis). IconPlaceholder resolves to
// lucide (see spinner.tsrx).
//
// DropdownMenuContent wraps Portal+Content, and the checkbox/radio/sub-trigger
// items compose an indicator/chevron with the consumer's children — radix's
// Portal (Slot) and any child reordering need real element DESCRIPTORS, so
// those parts are composed with createElement (the cmdk Command.Dialog
// precedent); the consumer's children flow through the ordinary props.children
// channel.
import { createElement, type OctaneNode } from 'octane';
import { DropdownMenu as DropdownMenuPrimitive } from '@octanejs/radix';
import { CheckIcon, ChevronRightIcon } from '@octanejs/lucide';

import { cn } from '@/lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export function DropdownMenu(props: Record<string, unknown>) @{
	<DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

// OCTANE DIVERGENCE: radix's Portal slots its child, which requires a real
// element descriptor — opaque compiled .tsrx children are not accepted here.
// Compose Portal children with createElement (see DropdownMenuContent).
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
	align?: 'start' | 'center' | 'end';
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
				'cn-dropdown-menu-content cn-menu-target cn-menu-translucent z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto data-[state=closed]:overflow-hidden',
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
			'cn-dropdown-menu-item group/dropdown-menu-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
			className,
		)}
		{...props}
	/>
}

export function DropdownMenuCheckboxItem({
	className,
	children,
	checked,
	inset,
	...props
}: Props & {
	children?: OctaneNode;
	checked?: boolean | 'indeterminate';
	inset?: boolean;
}) {
	return createElement(
		DropdownMenuPrimitive.CheckboxItem,
		{
			'data-slot': 'dropdown-menu-checkbox-item',
			'data-inset': inset,
			className: cn(
				'cn-dropdown-menu-checkbox-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
				className,
			),
			checked,
			...props,
		},
		createElement(
			'span',
			{
				className: 'cn-dropdown-menu-item-indicator pointer-events-none',
				'data-slot': 'dropdown-menu-checkbox-item-indicator',
			},
			createElement(DropdownMenuPrimitive.ItemIndicator, null, createElement(CheckIcon, {})),
		),
		children,
	);
}

export function DropdownMenuRadioGroup(props: Record<string, unknown>) @{
	<DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

export function DropdownMenuRadioItem({ className, children, inset, ...props }: Props & {
	children?: OctaneNode;
	inset?: boolean;
}) {
	return createElement(
		DropdownMenuPrimitive.RadioItem,
		{
			'data-slot': 'dropdown-menu-radio-item',
			'data-inset': inset,
			className: cn(
				'cn-dropdown-menu-radio-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
				className,
			),
			...props,
		},
		createElement(
			'span',
			{
				className: 'cn-dropdown-menu-item-indicator pointer-events-none',
				'data-slot': 'dropdown-menu-radio-item-indicator',
			},
			createElement(DropdownMenuPrimitive.ItemIndicator, null, createElement(CheckIcon, {})),
		),
		children,
	);
}

export function DropdownMenuLabel({ className, inset, ...props }: Props & { inset?: boolean }) @{
	<DropdownMenuPrimitive.Label
		data-slot="dropdown-menu-label"
		data-inset={inset}
		className={cn('cn-dropdown-menu-label', className)}
		{...props}
	/>
}

export function DropdownMenuSeparator({ className, ...props }: Props) @{
	<DropdownMenuPrimitive.Separator
		data-slot="dropdown-menu-separator"
		className={cn('cn-dropdown-menu-separator', className)}
		{...props}
	/>
}

export function DropdownMenuShortcut({ className, ...props }: Props) @{
	<span
		data-slot="dropdown-menu-shortcut"
		className={cn('cn-dropdown-menu-shortcut', className)}
		{...props}
	/>
}

export function DropdownMenuSub(props: Record<string, unknown>) @{
	<DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

export function DropdownMenuSubTrigger({ className, inset, children, ...props }: Props & {
	inset?: boolean;
	children?: OctaneNode;
}) {
	return createElement(
		DropdownMenuPrimitive.SubTrigger,
		{
			'data-slot': 'dropdown-menu-sub-trigger',
			'data-inset': inset,
			className: cn(
				'cn-dropdown-menu-sub-trigger flex cursor-default items-center outline-hidden select-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
				className,
			),
			...props,
		},
		children,
		createElement(ChevronRightIcon, { className: 'cn-rtl-flip ml-auto' }),
	);
}

export function DropdownMenuSubContent({ className, ...props }: Props) @{
	<DropdownMenuPrimitive.SubContent
		data-slot="dropdown-menu-sub-content"
		className={cn(
			'cn-dropdown-menu-sub-content cn-menu-target cn-menu-translucent z-50 origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden',
			className,
		)}
		{...props}
	/>
}
