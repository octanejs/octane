// Base UI base accordion — transcribed from upstream's `bases/base-ui/ui/accordion.tsx`
// (maintainer-supplied), class strings and data-slot names verbatim. Runs on
// @octanejs/base-ui/accordion.
//
// Note the part mapping: upstream shadcn names the content part `AccordionContent` while the
// underlying Base UI part is `Accordion.Panel`, and `AccordionTrigger` renders the
// `Accordion.Header` wrapper itself rather than exposing it. Both are upstream's shape, kept
// as-is so consumers following the shadcn docs get the components they expect.
//
// Octane adaptations: no `"use client"` (octane has no Server Components); upstream's
// IconPlaceholder resolves at port time to lucide via @octanejs/lucide.
import { Accordion as AccordionPrimitive } from '@octanejs/base-ui/accordion';
import { ChevronDownIcon, ChevronUpIcon } from '@octanejs/lucide';

import { cn } from '../../../lib/utils';

export function Accordion({ className, ...props }: Record<string, any>) @{
	<AccordionPrimitive.Root
		data-slot="accordion"
		className={cn('flex w-full flex-col', className)}
		{...props}
	/>
}

export function AccordionItem({ className, ...props }: Record<string, any>) @{
	<AccordionPrimitive.Item
		data-slot="accordion-item"
		className={cn('not-last:border-b', className)}
		{...props}
	/>
}

export function AccordionTrigger({ className, children, ...props }: Record<string, any>) @{
	<AccordionPrimitive.Header className="flex">
		<AccordionPrimitive.Trigger
			data-slot="accordion-trigger"
			className={cn(
				'group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:border-ring aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground',
				className,
			)}
			{...props}
		>
			{children}
			<ChevronDownIcon
				data-slot="accordion-trigger-icon"
				className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden"
			/>
			<ChevronUpIcon
				data-slot="accordion-trigger-icon"
				className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline"
			/>
		</AccordionPrimitive.Trigger>
	</AccordionPrimitive.Header>
}

// `className` styles the INNER div, not the panel — upstream keeps the panel's own class string
// fixed so the open/close animation hooks cannot be overridden away by a consumer class.
export function AccordionContent({ className, children, ...props }: Record<string, any>) @{
	<AccordionPrimitive.Panel
		data-slot="accordion-content"
		className="overflow-hidden text-sm data-open:animate-accordion-down data-closed:animate-accordion-up"
		{...props}
	>
		<div
			className={cn(
				'h-(--accordion-panel-height) pt-0 pb-2.5 data-ending-style:h-0 data-starting-style:h-0 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
				className,
			)}
		>{children}</div>
	</AccordionPrimitive.Panel>
}
