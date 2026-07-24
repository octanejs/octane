// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/table.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis). Table renders inside the upstream
// table-container wrapper div.
import { cn } from '../lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export function Table({ className, ...props }: Props) @{
	<div data-slot="table-container" className="cn-table-container">
		<table data-slot="table" className={cn('cn-table', className)} {...props} />
	</div>
}

export function TableHeader({ className, ...props }: Props) @{
	<thead data-slot="table-header" className={cn('cn-table-header', className)} {...props} />
}

export function TableBody({ className, ...props }: Props) @{
	<tbody data-slot="table-body" className={cn('cn-table-body', className)} {...props} />
}

export function TableFooter({ className, ...props }: Props) @{
	<tfoot data-slot="table-footer" className={cn('cn-table-footer', className)} {...props} />
}

export function TableRow({ className, ...props }: Props) @{
	<tr
		data-slot="table-row"
		className={cn('cn-table-row has-aria-expanded:bg-muted/50', className)}
		{...props}
	/>
}

export function TableHead({ className, ...props }: Props) @{
	<th data-slot="table-head" className={cn('cn-table-head', className)} {...props} />
}

export function TableCell({ className, ...props }: Props) @{
	<td data-slot="table-cell" className={cn('cn-table-cell', className)} {...props} />
}

export function TableCaption({ className, ...props }: Props) @{
	<caption data-slot="table-caption" className={cn('cn-table-caption', className)} {...props} />
}
