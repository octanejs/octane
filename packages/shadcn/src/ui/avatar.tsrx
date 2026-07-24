// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/avatar.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis). Image load state lives in the radix
// primitive: AvatarImage renders only once its src has loaded; AvatarFallback
// renders whenever it hasn't.
import { Avatar as AvatarPrimitive } from '@octanejs/radix';

import { cn } from '../lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export interface AvatarProps extends Record<string, unknown> {
	className?: string;
	size?: 'default' | 'sm' | 'lg';
}

export function Avatar({ className, size = 'default', ...props }: AvatarProps) @{
	<AvatarPrimitive.Root
		data-slot="avatar"
		data-size={size}
		className={cn(
			'cn-avatar group/avatar relative flex shrink-0 select-none after:absolute after:inset-0 after:border after:border-border after:mix-blend-darken dark:after:mix-blend-lighten',
			className,
		)}
		{...props}
	/>
}

export function AvatarImage({ className, ...props }: Props) @{
	<AvatarPrimitive.Image
		data-slot="avatar-image"
		className={cn('cn-avatar-image aspect-square size-full object-cover', className)}
		{...props}
	/>
}

export function AvatarFallback({ className, ...props }: Props) @{
	<AvatarPrimitive.Fallback
		data-slot="avatar-fallback"
		className={cn(
			'cn-avatar-fallback flex size-full items-center justify-center text-sm group-data-[size=sm]/avatar:text-xs',
			className,
		)}
		{...props}
	/>
}

export function AvatarBadge({ className, ...props }: Props) @{
	<span
		data-slot="avatar-badge"
		className={cn(
			'cn-avatar-badge absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-blend-color ring-2 select-none',
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
			'cn-avatar-group group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background',
			className,
		)}
		{...props}
	/>
}

export function AvatarGroupCount({ className, ...props }: Props) @{
	<div
		data-slot="avatar-group-count"
		className={cn(
			'cn-avatar-group-count relative flex shrink-0 items-center justify-center ring-2 ring-background',
			'',
			className,
		)}
		{...props}
	/>
}
