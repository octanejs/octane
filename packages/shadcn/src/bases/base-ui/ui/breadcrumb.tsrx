// Base UI base breadcrumb — class strings from the maintainer-supplied radix source, verbatim.
// Six of the seven parts are plain host elements with no primitive underneath and no state
// attributes, so they carry across unchanged and there is no dialect to get wrong.
//
// `BreadcrumbLink` IS MISSING ITS ESCAPE HATCH, and unlike badge that costs something real: the
// `asChild` branch is how a router's Link gets plugged in, which is most of what this family is
// for. It is still left out, for the same reason:
//
//   radix        `asChild` swaps in `Slot`, a pure prop-merger
//   React Aria   routes through RAC's own `Link` primitive with a `render` prop
//   Base UI      has neither — no Slot, and no Link primitive
//
// Base UI's house convention is a `render` ELEMENT prop backed by `useRender`, and this base
// already relies on it where a real primitive offers it (see pagination). But breadcrumb has no
// primitive, so nothing here settles whether upstream's Base UI breadcrumb implements `render`
// itself, and an API shape is not something a later commit can quietly correct — adding it is
// additive, shipping the wrong spelling is breaking.
//
// Until then a router link still works, it just has to carry the classes itself:
//
//     <BreadcrumbItem>
//       <RouterLink className="transition-colors hover:text-foreground">Home</RouterLink>
//     </BreadcrumbItem>
//
// which loses only the `data-slot="breadcrumb-link"` hook.
import { ChevronRightIcon, MoreHorizontalIcon } from '@octanejs/lucide';
import { type OctaneNode } from 'octane';

import { cn } from '../../../lib/utils';

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

export interface BreadcrumbLinkProps extends Props {
	/**
 * NOT SUPPORTED in this base — see the header. Declared as `never` so markup carrying it over
 * from the radix base fails to compile instead of silently rendering the anchor AND the child,
 * which nests one link inside another.
 */
	asChild?: never;
}

export function BreadcrumbLink({ className, ...props }: BreadcrumbLinkProps) @{
	<a
		data-slot="breadcrumb-link"
		className={cn('transition-colors hover:text-foreground', className)}
		{...props}
	/>
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
