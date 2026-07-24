// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/menubar.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis). IconPlaceholder resolves to lucide (see
// spinner.tsrx).
//
// MenubarContent wraps MenubarPortal+Content, and the checkbox/radio/
// sub-trigger items compose an indicator/chevron with the consumer's children
// — radix's Portal (Slot) and any child reordering need real element
// DESCRIPTORS, so those parts are composed with createElement (the cmdk
// Command.Dialog precedent); the consumer's children flow through the ordinary
// props.children channel.
import { createElement, type OctaneNode } from 'octane';
import { Menubar as MenubarPrimitive } from '@octanejs/radix';
import { CheckIcon, ChevronRightIcon } from '@octanejs/lucide';

import { cn } from '@/lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export function Menubar({ className, ...props }: Props) @{
	<MenubarPrimitive.Root
		data-slot="menubar"
		className={cn('cn-menubar flex items-center', className)}
		{...props}
	/>
}

export function MenubarMenu(props: Record<string, unknown>) @{
	<MenubarPrimitive.Menu data-slot="menubar-menu" {...props} />
}

export function MenubarGroup(props: Record<string, unknown>) @{
	<MenubarPrimitive.Group data-slot="menubar-group" {...props} />
}

// OCTANE DIVERGENCE: radix's Portal slots its child, which requires a real
// element descriptor — opaque compiled .tsrx children are not accepted here.
// Compose Portal children with createElement (see MenubarContent).
export function MenubarPortal(props: Record<string, unknown>) @{
	<MenubarPrimitive.Portal data-slot="menubar-portal" {...props} />
}

export function MenubarRadioGroup(props: Record<string, unknown>) @{
	<MenubarPrimitive.RadioGroup data-slot="menubar-radio-group" {...props} />
}

export function MenubarTrigger({ className, ...props }: Props) @{
	<MenubarPrimitive.Trigger
		data-slot="menubar-trigger"
		className={cn('cn-menubar-trigger flex items-center outline-hidden select-none', className)}
		{...props}
	/>
}

export function MenubarContent({
	className,
	align = 'start',
	alignOffset = -4,
	sideOffset = 8,
	...props
}: Props & {
	align?: 'start' | 'center' | 'end';
	alignOffset?: number;
	sideOffset?: number;
}) {
	return createElement(
		MenubarPortal,
		null,
		createElement(MenubarPrimitive.Content, {
			'data-slot': 'menubar-content',
			align,
			alignOffset,
			sideOffset,
			className: cn(
				'cn-menubar-content cn-menu-target cn-menu-translucent z-50 origin-(--radix-menubar-content-transform-origin) overflow-hidden',
				className,
			),
			...props,
		}),
	);
}

export function MenubarItem({ className, inset, variant = 'default', ...props }: Props & {
	inset?: boolean;
	variant?: 'default' | 'destructive';
}) @{
	<MenubarPrimitive.Item
		data-slot="menubar-item"
		data-inset={inset}
		data-variant={variant}
		className={cn(
			'cn-menubar-item group/menubar-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
			className,
		)}
		{...props}
	/>
}

export function MenubarCheckboxItem({ className, children, checked, inset, ...props }: Props & {
	children?: OctaneNode;
	checked?: boolean | 'indeterminate';
	inset?: boolean;
}) {
	return createElement(
		MenubarPrimitive.CheckboxItem,
		{
			'data-slot': 'menubar-checkbox-item',
			'data-inset': inset,
			className: cn(
				'cn-menubar-checkbox-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
				className,
			),
			checked,
			...props,
		},
		createElement(
			'span',
			{
				className: 'cn-menubar-checkbox-item-indicator pointer-events-none absolute flex items-center justify-center',
			},
			createElement(MenubarPrimitive.ItemIndicator, null, createElement(CheckIcon, {})),
		),
		children,
	);
}

export function MenubarRadioItem({ className, children, inset, ...props }: Props & {
	children?: OctaneNode;
	inset?: boolean;
}) {
	return createElement(
		MenubarPrimitive.RadioItem,
		{
			'data-slot': 'menubar-radio-item',
			'data-inset': inset,
			className: cn(
				'cn-menubar-radio-item relative flex cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
				className,
			),
			...props,
		},
		createElement(
			'span',
			{
				className: 'cn-menubar-radio-item-indicator pointer-events-none absolute flex items-center justify-center',
			},
			createElement(MenubarPrimitive.ItemIndicator, null, createElement(CheckIcon, {})),
		),
		children,
	);
}

export function MenubarLabel({ className, inset, ...props }: Props & { inset?: boolean }) @{
	<MenubarPrimitive.Label
		data-slot="menubar-label"
		data-inset={inset}
		className={cn('cn-menubar-label', className)}
		{...props}
	/>
}

export function MenubarSeparator({ className, ...props }: Props) @{
	<MenubarPrimitive.Separator
		data-slot="menubar-separator"
		className={cn('cn-menubar-separator -mx-1 my-1 h-px', className)}
		{...props}
	/>
}

export function MenubarShortcut({ className, ...props }: Props) @{
	<span
		data-slot="menubar-shortcut"
		className={cn('cn-menubar-shortcut ml-auto', className)}
		{...props}
	/>
}

export function MenubarSub(props: Record<string, unknown>) @{
	<MenubarPrimitive.Sub data-slot="menubar-sub" {...props} />
}

export function MenubarSubTrigger({ className, inset, children, ...props }: Props & {
	inset?: boolean;
	children?: OctaneNode;
}) {
	return createElement(
		MenubarPrimitive.SubTrigger,
		{
			'data-slot': 'menubar-sub-trigger',
			'data-inset': inset,
			className: cn(
				'cn-menubar-sub-trigger flex cursor-default items-center outline-none select-none',
				className,
			),
			...props,
		},
		children,
		createElement(ChevronRightIcon, { className: 'cn-rtl-flip ml-auto size-4' }),
	);
}

export function MenubarSubContent({ className, ...props }: Props) @{
	<MenubarPrimitive.SubContent
		data-slot="menubar-sub-content"
		className={cn(
			'cn-menubar-sub-content cn-menu-target cn-menu-translucent z-50 origin-(--radix-menubar-content-transform-origin) overflow-hidden',
			className,
		)}
		{...props}
	/>
}
