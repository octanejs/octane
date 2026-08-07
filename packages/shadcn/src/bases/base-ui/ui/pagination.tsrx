// Base UI base pagination — TRANSCRIBED from upstream's `bases/base-ui/ui/pagination.tsx`
// (maintainer-supplied), class strings verbatim. There is no pagination primitive in any base;
// the family is host elements plus button styling, and the only base-specific question is how the
// link acquires that styling.
//
// THE LINK GOES THROUGH `Button`, NOT THROUGH `buttonVariants`. The radix base writes
// `<Button asChild><a/></Button>`, where Slot is a pure prop-merger that layers no button
// semantics onto the anchor. Base UI has no Slot, so upstream uses the `render` prop plus
// `nativeButton={false}` — the documented escape for "this Button is not a native `<button>`".
//
// THE TWO BASES THEREFORE DIVERGE OBSERVABLY, and that is upstream's call, not a porting bug:
// this base's links carry `role="button"` and `tabindex="0"` (verified by rendering) where the
// radix base's carry neither. `nativeButton={false}` is what keeps keyboard activation working on
// a non-button element, which is the trade upstream chose. Do not "fix" this toward radix by
// dropping Button for a bare `buttonVariants()` anchor: it diverges from the source, and it also
// drops the key handling Base UI attaches.
//
// Octane adaptations: lucide-react → @octanejs/lucide, and children are passed explicitly rather
// than riding along in the props spread — React's `ComponentProps<"a">` carries `children`, octane
// routes it through its own channel.
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
	return createElement(Button, {
		variant: isActive ? 'outline' : 'ghost',
		size,
		className: cn(className),
		nativeButton: false,
		render: createElement('a', {
			'aria-current': isActive ? 'page' : undefined,
			'data-slot': 'pagination-link',
			'data-active': isActive,
			...props,
			children,
		}),
	});
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
