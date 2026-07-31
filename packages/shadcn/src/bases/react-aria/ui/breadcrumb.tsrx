// OCTANE ADAPTATION: octane's renderable type is `OctaneNode = unknown`, and a
// union containing `unknown` collapses to `unknown` — so RAC's
// `ChildrenOrFunction` cannot keep its render-prop arm distinguishable the way
// React's precise `ReactNode` union does, and composeRenderProps has nothing to
// infer its render values from. Annotating them here restores the upstream
// parameter types without weakening the binding.
import {
	Breadcrumb as BreadcrumbPrimitive,
	Breadcrumbs as BreadcrumbsPrimitive,
	composeRenderProps,
	Link as LinkPrimitive,
	type BreadcrumbProps,
	type BreadcrumbRenderProps,
	type BreadcrumbsProps,
	type LinkProps,
} from '@octanejs/aria/components';

import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';
import { ChevronRightIcon, MoreHorizontalIcon } from '@octanejs/lucide';

export function Breadcrumb({ className, ...props }: HostProps<'nav'>) {
	return <nav
		aria-label="breadcrumb"
		data-slot="breadcrumb"
		className={cn(className)}
		{...props}
	/>;
}

export function BreadcrumbList<T extends object>({ className, ...props }: BreadcrumbsProps<T>) {
	return <BreadcrumbsPrimitive
		data-slot="breadcrumb-list"
		className={cn(
			'flex flex-wrap items-center gap-1.5 text-sm wrap-break-word text-muted-foreground',
			className,
		)}
		{...props}
	/>;
}

export function BreadcrumbItem({
	className,
	children,
	separatorClassName,
	...props
}: BreadcrumbProps & { separatorClassName?: string }) {
	return <BreadcrumbPrimitive
		data-slot="breadcrumb-item"
		className={cn('inline-flex items-center gap-1', className)}
		{...props}
	>{composeRenderProps(
		children,
		(children, { isCurrent }: BreadcrumbRenderProps) => <>
			{children}
			{!isCurrent &&
				<span
					data-slot="breadcrumb-separator"
					role="presentation"
					aria-hidden="true"
					className={cn('[&>svg]:size-3.5', separatorClassName)}
				>
					<ChevronRightIcon />
				</span>}
		</>,
	)}</BreadcrumbPrimitive>;
}

export function BreadcrumbLink({ className, render, ...props }: LinkProps) {
	return <LinkPrimitive
		data-slot="breadcrumb-link"
		className={cn('transition-colors hover:text-foreground', className)}
		render={render}
		{...props}
	/>;
}

export function BreadcrumbPage({ className, ...props }: HostProps<'span'>) {
	return <span
		data-slot="breadcrumb-page"
		role="link"
		aria-disabled="true"
		aria-current="page"
		className={cn('font-normal text-foreground', className)}
		{...props}
	/>;
}

export function BreadcrumbEllipsis({ className, ...props }: HostProps<'span'>) {
	return <span
		data-slot="breadcrumb-ellipsis"
		role="presentation"
		aria-hidden="true"
		className={cn('flex size-5 items-center justify-center [&>svg]:size-4', className)}
		{...props}
	>
		<MoreHorizontalIcon />
		<span className="sr-only">More</span>
	</span>;
}
