// App-owned accordion (the shadcn registry-mode ownership model): a custom
// utilities-inlined flavor. Octane adaptations from the shared React source:
// "use client" dropped, lucide-react → @octanejs/lucide, radix-ui →
// @octanejs/radix. Children forwarding uses the compiler's `{props.children}`
// lowering (the syntactic form is load-bearing — a destructured `children`
// local is not recognized as a forwardable hole), so the markup reads exactly
// like the React source.
import { Accordion as AccordionPrimitive } from '@octanejs/radix';
import { ChevronDownIcon, ChevronUpIcon } from '@octanejs/lucide';
import type { OctaneNode } from 'octane';

import { cn } from '@/lib/utils';

type Props = { className?: string; children?: OctaneNode } & Record<string, unknown>;

export function Accordion({ className, ...props }: Props) @{
	<AccordionPrimitive.Root
		data-slot="accordion"
		className={cn('flex w-full flex-col', className)}
		{...props}
	/>
}

export function AccordionItem({ className, ...props }: Props) @{
	<AccordionPrimitive.Item
		data-slot="accordion-item"
		className={cn('not-last:border-b', className)}
		{...props}
	/>
}

export function AccordionTrigger(props: Props) @{
	const { className, children: _children, ...rest } = props;

	<AccordionPrimitive.Header className="flex">
		<AccordionPrimitive.Trigger
			data-slot="accordion-trigger"
			className={cn(
				'group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:border-ring disabled:pointer-events-none disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground',
				className,
			)}
			{...rest}
		>
			{props.children}
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

export function AccordionContent(props: Props) @{
	const { className, children: _children, ...rest } = props;

	<AccordionPrimitive.Content
		data-slot="accordion-content"
		className="overflow-hidden text-sm data-open:animate-accordion-down data-closed:animate-accordion-up"
		{...rest}
	>
		<div
			className={cn(
				'h-(--radix-accordion-content-height) pt-0 pb-2.5 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
				className,
			)}
		>{props.children}</div>
	</AccordionPrimitive.Content>
}
