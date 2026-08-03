// Base UI base avatar — runs on @octanejs/base-ui's Avatar (Root/Image/Fallback), a direct
// one-to-one mapping with the radix base.
//
// `AvatarBadge`, `AvatarGroup` and `AvatarGroupCount` are plain host elements in every base —
// upstream defines no primitive for them — so they are unchanged from the radix source.
//
// Nothing here keys off a primitive-emitted attribute: the `data-[size=…]` variants read the
// `data-size` this component writes itself, and the primitive emits no state attributes at all
// (verified by rendering it — Root and Fallback are bare spans). So unlike the overlays and the
// form controls, there is no dialect to get wrong.
//
// UNVERIFIED PROVENANCE: class strings come from this package's radix base rather than
// transcribed from upstream's Base UI source.
import { Avatar as AvatarPrimitive } from '@octanejs/base-ui/avatar';

import { cn } from '../../../lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export interface AvatarProps extends Props {
	size?: 'default' | 'sm' | 'lg';
}

export function Avatar({ className, size = 'default', ...props }: AvatarProps) @{
	<AvatarPrimitive.Root
		data-slot="avatar"
		data-size={size}
		className={cn(
			'group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten',
			className,
		)}
		{...props}
	/>
}

export function AvatarImage({ className, ...props }: Props) @{
	<AvatarPrimitive.Image
		data-slot="avatar-image"
		className={cn('aspect-square size-full rounded-full object-cover', className)}
		{...props}
	/>
}

export function AvatarFallback({ className, ...props }: Props) @{
	<AvatarPrimitive.Fallback
		data-slot="avatar-fallback"
		className={cn(
			'flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs',
			className,
		)}
		{...props}
	/>
}

export function AvatarBadge({ className, ...props }: Props) @{
	<span
		data-slot="avatar-badge"
		className={cn(
			'absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none',
			'group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden',
			'group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2',
			'group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2',
			className,
		)}
		{...props}
	/>
}

export function AvatarGroup({ className, ...props }: Props) @{
	<div
		data-slot="avatar-group"
		className={cn(
			'group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background',
			className,
		)}
		{...props}
	/>
}

export function AvatarGroupCount({ className, ...props }: Props) @{
	<div
		data-slot="avatar-group-count"
		className={cn(
			'relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3',
			className,
		)}
		{...props}
	/>
}
