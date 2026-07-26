// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/table.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis). Table renders inside the upstream
// table-container wrapper div.
import { cn } from '../lib/utils';

// Multi-host family (div/table/thead/tbody/tr/th/td/caption): no single host
// prop table applies, so the shared alias stays structural.
type Props = { className?: string } & Record<string, unknown>;

export function Table({ className, ...props }: Props) @{
	<div data-slot="table-container" className="relative w-full overflow-x-auto">
		<table
			data-slot="table"
			className={cn('w-full caption-bottom text-sm', className)}
			{...props}
		/>
	</div>
}

export function TableHeader({ className, ...props }: Props) @{
	<thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />
}

export function TableBody({ className, ...props }: Props) @{
	<tbody
		data-slot="table-body"
		className={cn('[&_tr:last-child]:border-0', className)}
		{...props}
	/>
}

export function TableFooter({ className, ...props }: Props) @{
	<tfoot
		data-slot="table-footer"
		className={cn('bg-muted/50 border-t font-medium [&>tr]:last:border-b-0', className)}
		{...props}
	/>
}

export function TableRow({ className, ...props }: Props) @{
	<tr
		data-slot="table-row"
		className={cn(
			'border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
			className,
		)}
		{...props}
	/>
}

export function TableHead({ className, ...props }: Props) @{
	<th
		data-slot="table-head"
		className={cn(
			'text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
			className,
		)}
		{...props}
	/>
}

export function TableCell({ className, ...props }: Props) @{
	<td
		data-slot="table-cell"
		className={cn(
			'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
			className,
		)}
		{...props}
	/>
}

export function TableCaption({ className, ...props }: Props) @{
	<caption
		data-slot="table-caption"
		className={cn('text-muted-foreground mt-4 text-sm', className)}
		{...props}
	/>
}
