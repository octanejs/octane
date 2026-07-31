// Pagination — maintainer-supplied default-Tailwind flavor, class strings
// verbatim. Octane adaptations: lucide-react → @octanejs/lucide; PaginationLink
// is upstream's `<Button asChild><a …>` — Slot needs a real element descriptor
// as its child, so the Button/anchor pair composes with createElement and the
// link's children flow through the anchor's children prop.
import { createElement, type OctaneNode } from 'octane';
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from '@octanejs/lucide';

import { cn } from '../../../lib/utils';
import { Button, type ButtonProps } from './button.tsrx';

type Props = { className?: string } & Record<string, unknown>;

export function Pagination({ className, ...props }: Props) @{
	<nav
		role="navigation"
		aria-label="pagination"
		data-slot="pagination"
		className={cn('mx-auto flex w-full justify-center', className)}
		{...props}
	/>
}

export function PaginationContent({ className, ...props }: Props) @{
	<ul
		data-slot="pagination-content"
		className={cn('flex items-center gap-0.5', className)}
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
			className: cn(className),
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
}: PaginationLinkProps & {
	text?: string;
}) @{
	<PaginationLink
		aria-label="Go to previous page"
		size="default"
		className={cn('pl-1.5!', className)}
		{...props}
	>
		<ChevronLeftIcon data-icon="inline-start" className="cn-rtl-flip" />
		<span className="hidden sm:block">{text as string}</span>
	</PaginationLink>
}

export function PaginationNext({ className, text = 'Next', ...props }: PaginationLinkProps & {
	text?: string;
}) @{
	<PaginationLink
		aria-label="Go to next page"
		size="default"
		className={cn('pr-1.5!', className)}
		{...props}
	>
		<span className="hidden sm:block">{text as string}</span>
		<ChevronRightIcon data-icon="inline-end" className="cn-rtl-flip" />
	</PaginationLink>
}

export function PaginationEllipsis({ className, ...props }: Props) @{
	<span
		aria-hidden="true"
		data-slot="pagination-ellipsis"
		className={cn(
			'flex size-8 items-center justify-center [&_svg:not([class*=\'size-\'])]:size-4',
			className,
		)}
		{...props}
	>
		<MoreHorizontalIcon />
		<span className="sr-only">More pages</span>
	</span>
}
