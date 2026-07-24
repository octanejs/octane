// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/accordion.tsx (the `"use client"` directive
// is dropped — octane has no RSC axis). IconPlaceholder resolves to lucide
// (see spinner.tsrx).
//
// AccordionTrigger and AccordionContent forward opaque compiled children next
// to sibling descriptors (the icons / the inner div), so they are composed
// with createElement (the cmdk Command.Dialog precedent — see
// breadcrumb.tsrx's comment).
import { Accordion as AccordionPrimitive } from '@octanejs/radix';
import { ChevronDownIcon, ChevronUpIcon } from '@octanejs/lucide';
import { createElement, type OctaneNode } from 'octane';

import { cn } from '@/lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export function Accordion({ className, ...props }: Props) @{
	<AccordionPrimitive.Root
		data-slot="accordion"
		className={cn('cn-accordion flex w-full flex-col', className)}
		{...props}
	/>
}

export function AccordionItem({ className, ...props }: Props) @{
	<AccordionPrimitive.Item
		data-slot="accordion-item"
		className={cn('cn-accordion-item', className)}
		{...props}
	/>
}

export function AccordionTrigger({ className, children, ...props }: Props & {
	children?: OctaneNode;
}) {
	return createElement(
		AccordionPrimitive.Header,
		{ className: 'flex' },
		createElement(
			AccordionPrimitive.Trigger,
			{
				'data-slot': 'accordion-trigger',
				className: cn(
					'cn-accordion-trigger group/accordion-trigger relative flex flex-1 items-start justify-between border border-transparent transition-all outline-none disabled:pointer-events-none disabled:opacity-50',
					className,
				),
				...props,
			},
			children,
			createElement(ChevronDownIcon, {
				'data-slot': 'accordion-trigger-icon',
				className: 'cn-accordion-trigger-icon pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden',
			}),
			createElement(ChevronUpIcon, {
				'data-slot': 'accordion-trigger-icon',
				className: 'cn-accordion-trigger-icon pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline',
			}),
		),
	);
}

export function AccordionContent({ className, children, ...props }: Props & {
	children?: OctaneNode;
}) {
	return createElement(
		AccordionPrimitive.Content,
		{
			'data-slot': 'accordion-content',
			className: 'cn-accordion-content overflow-hidden',
			...props,
		},
		createElement(
			'div',
			{
				className: cn(
					'cn-accordion-content-inner h-(--radix-accordion-content-height) [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
					className,
				),
			},
			children,
		),
	);
}
