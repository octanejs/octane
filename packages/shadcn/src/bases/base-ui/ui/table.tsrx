// Base UI base table — THIS FAMILY IS BASE-INDEPENDENT. Neither Radix nor Base UI publishes a
// table primitive, so upstream ships the same plain host elements in both bases and this file is
// the radix base's content unchanged. (The React Aria base is the odd one out: RAC does have a
// table, so that base runs on real collection components with generic item types.)
//
// There is consequently no dialect to get wrong here and nothing to verify against a primitive:
// `data-[state=selected]` on the row is written by the CONSUMER — a data-table library setting
// selection state — not emitted by anything underneath, so unlike checkbox or toggle it is not a
// Radix-ism that needs translating.
import { cn } from '../../../lib/utils';

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
