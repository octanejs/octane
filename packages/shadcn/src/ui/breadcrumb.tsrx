// Default-Tailwind breadcrumb flavor (package canonical) — user-supplied
// styling, class strings verbatim. Octane adaptations: lucide-react →
// @octanejs/lucide, radix-ui Slot → @octanejs/radix (@if asChild);
// BreadcrumbSeparator's `children ?? icon` fallback composes with
// createElement (opaque children beside a descriptor default).
import { Slot } from '@octanejs/radix';
import { ChevronRightIcon, MoreHorizontalIcon } from '@octanejs/lucide';
import { createElement, type OctaneNode } from 'octane';

import { cn } from '../lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export function Breadcrumb({ className, ...props }: Props) @{
	<nav aria-label="breadcrumb" data-slot="breadcrumb" className={cn(className)} {...props} />
}

export function BreadcrumbList({ className, ...props }: Props) @{
	<ol
		data-slot="breadcrumb-list"
		className={cn(
			'flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground',
			className,
		)}
		{...props}
	/>
}

export function BreadcrumbItem({ className, ...props }: Props) @{
	<li
		data-slot="breadcrumb-item"
		className={cn('inline-flex items-center gap-1', className)}
		{...props}
	/>
}

export function BreadcrumbLink({ asChild, className, ...props }: Props & { asChild?: boolean }) @{
	@if (asChild) {
		<Slot
			data-slot="breadcrumb-link"
			className={cn('transition-colors hover:text-foreground', className)}
			{...props}
		/>
	} @else {
		<a
			data-slot="breadcrumb-link"
			className={cn('transition-colors hover:text-foreground', className)}
			{...props}
		/>
	}
}

export function BreadcrumbPage({ className, ...props }: Props) @{
	<span
		data-slot="breadcrumb-page"
		role="link"
		aria-disabled="true"
		aria-current="page"
		className={cn('font-normal text-foreground', className)}
		{...props}
	/>
}

export function BreadcrumbSeparator(props: Props & { children?: OctaneNode }) @{
	const { className, children: _children, ...rest } = props;

	<li
		data-slot="breadcrumb-separator"
		role="presentation"
		aria-hidden="true"
		className={cn('[&>svg]:size-3.5', className)}
		{...rest}
	>
		{props.children ?? <ChevronRightIcon className="cn-rtl-flip" />}
	</li>
}

export function BreadcrumbEllipsis({ className, ...props }: Props) @{
	<span
		data-slot="breadcrumb-ellipsis"
		role="presentation"
		aria-hidden="true"
		className={cn('flex size-5 items-center justify-center [&>svg]:size-4', className)}
		{...props}
	>
		<MoreHorizontalIcon />
		<span className="sr-only">More</span>
	</span>
}
