// OCTANE ADAPTATION: RAC's collection props are generic over the item type, and
// its JSX signatures fix that parameter at `object`. The wrappers therefore
// carry the same `T extends object` constraint upstream's collection types
// assume, so a caller's item type flows through instead of widening.
import {
	Cell as CellPrimitive,
	Column as ColumnPrimitive,
	Row as RowPrimitive,
	TableBody as TableBodyPrimitive,
	TableFooter as TableFooterPrimitive,
	TableHeader as TableHeaderPrimitive,
	Table as TablePrimitive,
	type CellProps,
	type ColumnProps,
	type RowProps,
	type TableBodyProps,
	type TableFooterProps,
	type TableHeaderProps,
	type TableProps,
} from '@octanejs/aria/components';

import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';

export function Table({ className, ...props }: TableProps) {
	return <div data-slot="table-container" className="relative w-full overflow-x-auto">
		<TablePrimitive
			data-slot="table"
			className={cn('w-full caption-bottom text-sm', className)}
			{...props}
		/>
	</div>;
}

export function TableHeader<T extends object>({ className, ...props }: TableHeaderProps<T>) {
	return <TableHeaderPrimitive
		data-slot="table-header"
		className={cn('[&_tr]:border-b', className)}
		{...props}
	/>;
}

export function TableBody<T extends object>({ className, ...props }: TableBodyProps<T>) {
	return <TableBodyPrimitive
		data-slot="table-body"
		className={cn('data-empty:h-24 data-empty:text-center [&_tr:last-child]:border-0', className)}
		{...props}
	/>;
}

export function TableFooter<T extends object>({ className, ...props }: TableFooterProps<T>) {
	return <TableFooterPrimitive
		data-slot="table-footer"
		className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
		{...props}
	/>;
}

export function TableRow<T extends object>({ className, ...props }: RowProps<T>) {
	return <RowPrimitive
		data-slot="table-row"
		className={cn(
			'border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted data-selected:bg-muted',
			className,
		)}
		{...props}
	/>;
}

export function TableHead({ className, ...props }: ColumnProps) {
	return <ColumnPrimitive
		data-slot="table-head"
		className={cn(
			'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([data-slot=checkbox])]:pr-0 [&:has([role=checkbox])]:pr-0',
			className,
		)}
		{...props}
	/>;
}

export function TableCell({ className, ...props }: CellProps) {
	return <CellPrimitive
		data-slot="table-cell"
		className={cn(
			'p-2 align-middle whitespace-nowrap [&:has([data-slot=checkbox])]:pr-0 [&:has([role=checkbox])]:pr-0',
			className,
		)}
		{...props}
	/>;
}

export function TableCaption({ className, ...props }: HostProps<'figcaption'>) {
	return <figcaption
		data-slot="table-caption"
		className={cn('mt-4 text-center text-sm text-muted-foreground', className)}
		{...props}
	/>;
}
