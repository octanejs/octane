// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/select.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis). IconPlaceholder resolves to lucide (see
// spinner.tsrx).
//
// SelectTrigger, SelectContent, and SelectItem are composed with createElement:
// radix's Portal and `asChild` Icon need real element DESCRIPTORS as children
// (the cmdk Command.Dialog precedent — see breadcrumb.tsrx's comment), and the
// consumer's children interleave with the icon/indicator parts. The consumer's
// children still flow through the ordinary props.children channel.
import { createElement, type OctaneNode } from 'octane';
import { Select as SelectPrimitive } from '@octanejs/radix';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from '@octanejs/lucide';

import { cn } from '@/lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export function Select(props: Record<string, unknown>) @{
	<SelectPrimitive.Root data-slot="select" {...props} />
}

export function SelectGroup({ className, ...props }: Props) @{
	<SelectPrimitive.Group
		data-slot="select-group"
		className={cn('cn-select-group', className)}
		{...props}
	/>
}

export function SelectValue(props: Record<string, unknown>) @{
	<SelectPrimitive.Value data-slot="select-value" {...props} />
}

export interface SelectTriggerProps extends Record<string, unknown> {
	className?: string;
	size?: 'sm' | 'default';
	children?: OctaneNode;
}

export function SelectTrigger({
	className,
	size = 'default',
	children,
	...props
}: SelectTriggerProps) {
	return createElement(
		SelectPrimitive.Trigger,
		{
			'data-slot': 'select-trigger',
			'data-size': size,
			className: cn(
				'cn-select-trigger flex w-fit items-center justify-between whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:opacity-50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
				className,
			),
			...props,
		},
		children,
		createElement(
			SelectPrimitive.Icon,
			{ asChild: true },
			createElement(ChevronDownIcon, {
				className: 'cn-select-trigger-icon pointer-events-none',
			}),
		),
	);
}

export interface SelectContentProps extends Record<string, unknown> {
	className?: string;
	position?: 'item-aligned' | 'popper';
	align?: 'start' | 'center' | 'end';
	children?: OctaneNode;
}

export function SelectContent({
	className,
	children,
	position = 'item-aligned',
	align = 'center',
	...props
}: SelectContentProps) {
	return createElement(
		SelectPrimitive.Portal,
		null,
		createElement(
			SelectPrimitive.Content,
			{
				'data-slot': 'select-content',
				'data-align-trigger': position === 'item-aligned',
				className: cn(
					'cn-select-content cn-menu-target cn-menu-translucent relative z-50 max-h-(--radix-select-content-available-height) origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto data-[align-trigger=true]:animate-none',
					position === 'popper' &&
						'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
					className,
				),
				position,
				align,
				...props,
			},
			createElement(SelectScrollUpButton, null),
			createElement(
				SelectPrimitive.Viewport,
				{
					'data-position': position,
					className: cn(
						'cn-select-viewport data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)',
						position === 'popper' && '',
					),
				},
				children,
			),
			createElement(SelectScrollDownButton, null),
		),
	);
}

export function SelectLabel({ className, ...props }: Props) @{
	<SelectPrimitive.Label
		data-slot="select-label"
		className={cn('cn-select-label', className)}
		{...props}
	/>
}

export interface SelectItemProps extends Record<string, unknown> {
	className?: string;
	children?: OctaneNode;
}

export function SelectItem({ className, children, ...props }: SelectItemProps) {
	return createElement(
		SelectPrimitive.Item,
		{
			'data-slot': 'select-item',
			className: cn(
				'cn-select-item relative flex w-full cursor-default items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
				className,
			),
			...props,
		},
		createElement(
			'span',
			{ className: 'cn-select-item-indicator' },
			createElement(
				SelectPrimitive.ItemIndicator,
				null,
				createElement(CheckIcon, {
					className: 'cn-select-item-indicator-icon pointer-events-none',
				}),
			),
		),
		createElement(SelectPrimitive.ItemText, null, children),
	);
}

export function SelectSeparator({ className, ...props }: Props) @{
	<SelectPrimitive.Separator
		data-slot="select-separator"
		className={cn('cn-select-separator pointer-events-none', className)}
		{...props}
	/>
}

export function SelectScrollUpButton({ className, ...props }: Props) @{
	<SelectPrimitive.ScrollUpButton
		data-slot="select-scroll-up-button"
		className={cn('cn-select-scroll-up-button', className)}
		{...props}
	>
		<ChevronUpIcon />
	</SelectPrimitive.ScrollUpButton>
}

export function SelectScrollDownButton({ className, ...props }: Props) @{
	<SelectPrimitive.ScrollDownButton
		data-slot="select-scroll-down-button"
		className={cn('cn-select-scroll-down-button', className)}
		{...props}
	>
		<ChevronDownIcon />
	</SelectPrimitive.ScrollDownButton>
}
