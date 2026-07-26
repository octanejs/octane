// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/pagination.tsx. IconPlaceholder resolves to
// lucide (see spinner.tsrx).
//
// PaginationLink is upstream's `<Button asChild><a …>` — Slot needs a real
// element DESCRIPTOR as its child, so the Button/anchor pair is composed with
// createElement (the cmdk Command.Dialog precedent); the link's own children
// flow through as the anchor's children prop.
import { createElement } from 'octane';
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from '@octanejs/lucide';
import type { OctaneNode } from 'octane';

import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from '@/components/ui/button';

type Props = { className?: string } & Record<string, unknown>;

export function Pagination({ className, ...props }: Props) @{
	<nav
		role="navigation"
		aria-label="pagination"
		data-slot="pagination"
		className={cn('cn-pagination mx-auto flex w-full justify-center', className)}
		{...props}
	/>
}

export function PaginationContent({ className, ...props }: Props) @{
	<ul
		data-slot="pagination-content"
		className={cn('cn-pagination-content flex items-center', className)}
		{...props}
	/>
}

export function PaginationItem(props: Record<string, unknown>) @{
	<li data-slot="pagination-item" {...props} />
}

export interface PaginationLinkProps extends Record<string, unknown> {
	className?: string;
	isActive?: boolean;
	size?: ButtonProps['size'];
	children?: OctaneNode;
}

export function PaginationLink({
	className,
	isActive,
	size = 'icon',
	children,
	...props
}: PaginationLinkProps) {
	return createElement(
		Button,
		{
			asChild: true,
			variant: isActive ? 'outline' : 'ghost',
			size,
			className: cn('cn-pagination-link', className),
		},
		createElement('a', {
			'aria-current': isActive ? 'page' : undefined,
			'data-slot': 'pagination-link',
			'data-active': isActive,
			...props,
			children,
		}),
	);
}

export function PaginationPrevious({
	className,
	text = 'Previous',
	...props
}: PaginationLinkProps & { text?: string }) @{
	<PaginationLink
		aria-label="Go to previous page"
		size="default"
		className={cn('cn-pagination-previous', className)}
		{...props}
	>
		<ChevronLeftIcon data-icon="inline-start" className="cn-rtl-flip" />
		<span className="cn-pagination-previous-text hidden sm:block">{text as string}</span>
	</PaginationLink>
}

export function PaginationNext({ className, text = 'Next', ...props }: PaginationLinkProps & {
	text?: string;
}) @{
	<PaginationLink
		aria-label="Go to next page"
		size="default"
		className={cn('cn-pagination-next', className)}
		{...props}
	>
		<span className="cn-pagination-next-text hidden sm:block">{text as string}</span>
		<ChevronRightIcon data-icon="inline-end" className="cn-rtl-flip" />
	</PaginationLink>
}

export function PaginationEllipsis({ className, ...props }: Props) @{
	<span
		aria-hidden="true"
		data-slot="pagination-ellipsis"
		className={cn('cn-pagination-ellipsis flex items-center justify-center', className)}
		{...props}
	>
		<MoreHorizontalIcon />
		<span className="sr-only">More pages</span>
	</span>
}
