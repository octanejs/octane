import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';
import { LinkButton } from './button.tsrx';
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from '@octanejs/lucide';

export function Pagination({ className, ...props }: HostProps<'nav'>) {
	return <nav
		role="navigation"
		aria-label="pagination"
		data-slot="pagination"
		className={cn('mx-auto flex w-full justify-center', className)}
		{...props}
	/>;
}

export function PaginationContent({ className, ...props }: HostProps<'ul'>) {
	return <ul
		data-slot="pagination-content"
		className={cn('flex items-center gap-0.5', className)}
		{...props}
	/>;
}

export function PaginationItem({ ...props }: HostProps<'li'>) {
	return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps =
	{
		isActive?: boolean;
	} & Omit<Record<string, any>, 'variant'>;

export function PaginationLink({
	className,
	isActive,
	size = 'icon',
	...props
}: PaginationLinkProps) {
	return <LinkButton
		variant={isActive ? 'outline' : 'ghost'}
		size={size}
		className={cn(className)}
		aria-current={isActive ? 'page' : undefined}
		data-slot="pagination-link"
		data-active={isActive}
		{...props}
	/>;
}

export function PaginationPrevious({ className, text = 'Previous', ...props }: Record<
	string,
	any
> & { text?: string }) {
	return <PaginationLink
		aria-label="Go to previous page"
		size="default"
		className={cn('pl-1.5!', className)}
		{...props}
	>
		<ChevronLeftIcon data-icon="inline-start" />
		<span className="hidden sm:block">{text}</span>
	</PaginationLink>;
}

export function PaginationNext({ className, text = 'Next', ...props }: Record<string, any> & {
	text?: string;
}) {
	return <PaginationLink
		aria-label="Go to next page"
		size="default"
		className={cn('pr-1.5!', className)}
		{...props}
	>
		<span className="hidden sm:block">{text}</span>
		<ChevronRightIcon data-icon="inline-end" />
	</PaginationLink>;
}

export function PaginationEllipsis({ className, ...props }: HostProps<'span'>) {
	return <span
		aria-hidden
		data-slot="pagination-ellipsis"
		className={cn(
			'flex size-8 items-center justify-center [&_svg:not([class*=\'size-\'])]:size-4',
			className,
		)}
		{...props}
	>
		<MoreHorizontalIcon />
		<span className="sr-only">More pages</span>
	</span>;
}
