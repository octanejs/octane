// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/breadcrumb.tsx. IconPlaceholder resolves to
// lucide (see spinner.tsrx); asChild follows the radix Slot descriptor
// contract (see badge.tsrx).
import { Slot } from '@octanejs/radix';
import { ChevronRightIcon, MoreHorizontalIcon } from '@octanejs/lucide';
import { createElement, type OctaneNode } from 'octane';

import { cn } from '../lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export function Breadcrumb({ className, ...props }: Props) @{
	<nav
		aria-label="breadcrumb"
		data-slot="breadcrumb"
		className={cn('cn-breadcrumb', className)}
		{...props}
	/>
}

export function BreadcrumbList({ className, ...props }: Props) @{
	<ol
		data-slot="breadcrumb-list"
		className={cn('cn-breadcrumb-list flex flex-wrap items-center wrap-break-word', className)}
		{...props}
	/>
}

export function BreadcrumbItem({ className, ...props }: Props) @{
	<li
		data-slot="breadcrumb-item"
		className={cn('cn-breadcrumb-item inline-flex items-center', className)}
		{...props}
	/>
}

export function BreadcrumbLink({ asChild, className, ...props }: Props & { asChild?: boolean }) @{
	@if (asChild) {
		<Slot data-slot="breadcrumb-link" className={cn('cn-breadcrumb-link', className)} {...props} />
	} @else {
		<a data-slot="breadcrumb-link" className={cn('cn-breadcrumb-link', className)} {...props} />
	}
}

export function BreadcrumbPage({ className, ...props }: Props) @{
	<span
		data-slot="breadcrumb-page"
		role="link"
		aria-disabled="true"
		aria-current="page"
		className={cn('cn-breadcrumb-page', className)}
		{...props}
	/>
}

// Opaque compiled children can only flow through the props.children channel —
// a bare `{children}` hole cannot render them — so the `children ?? <icon/>`
// fallback is composed with createElement (the cmdk Command.Dialog precedent).
export function BreadcrumbSeparator({ children, className, ...props }: Props & {
	children?: OctaneNode;
}) {
	return createElement(
		'li',
		{
			'data-slot': 'breadcrumb-separator',
			role: 'presentation',
			'aria-hidden': 'true',
			className: cn('cn-breadcrumb-separator', className),
			...props,
		},
		children ?? createElement(ChevronRightIcon, { className: 'cn-rtl-flip' }),
	);
}

export function BreadcrumbEllipsis({ className, ...props }: Props) @{
	<span
		data-slot="breadcrumb-ellipsis"
		role="presentation"
		aria-hidden="true"
		className={cn('cn-breadcrumb-ellipsis flex items-center justify-center', className)}
		{...props}
	>
		<MoreHorizontalIcon />
		<span className="sr-only">More</span>
	</span>
}
