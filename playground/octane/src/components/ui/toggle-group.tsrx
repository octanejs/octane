// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/toggle-group.tsx (the `"use client"` directive
// is dropped — octane has no RSC axis). React.createContext/useContext map onto
// octane's createContext/useContext.
//
// ToggleGroup is composed with createElement: the consumer's children must sit
// INSIDE the context Provider, and opaque compiled .tsrx children can only flow
// through the props.children channel (see breadcrumb.tsrx's comment).
import { createContext, createElement, useContext, type OctaneNode } from 'octane';
import { type VariantProps } from 'class-variance-authority';
import { ToggleGroup as ToggleGroupPrimitive } from '@octanejs/radix';

import { cn } from '@/lib/utils';
import { toggleVariants } from '@/components/ui/toggle';

const ToggleGroupContext = createContext<
	VariantProps<typeof toggleVariants> & {
		spacing?: number;
		orientation?: 'horizontal' | 'vertical';
	}
>({
	size: 'default',
	variant: 'default',
	spacing: 2,
	orientation: 'horizontal',
});

export interface ToggleGroupProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof toggleVariants>['variant'];
	size?: VariantProps<typeof toggleVariants>['size'];
	spacing?: number;
	orientation?: 'horizontal' | 'vertical';
	children?: OctaneNode;
}

export function ToggleGroup({
	className,
	variant,
	size,
	spacing = 2,
	orientation = 'horizontal',
	children,
	...props
}: ToggleGroupProps) {
	return createElement(
		ToggleGroupPrimitive.Root,
		{
			'data-slot': 'toggle-group',
			'data-variant': variant,
			'data-size': size,
			'data-spacing': spacing,
			'data-orientation': orientation,
			// Forwarded to the primitive: it drives RovingFocusGroup's arrow-key
			// axis (a vertical group must ignore left/right and use up/down).
			orientation,
			style: { '--gap': spacing },
			className: cn(
				'group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=default]:data-[variant=outline]:shadow-xs',
				className,
			),
			...props,
		},
		createElement(
			ToggleGroupContext.Provider,
			{ value: { variant, size, spacing, orientation } },
			children,
		),
	);
}

export interface ToggleGroupItemProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof toggleVariants>['variant'];
	size?: VariantProps<typeof toggleVariants>['size'];
}

export function ToggleGroupItem({
	className,
	variant = 'default',
	size = 'default',
	...props
}: ToggleGroupItemProps) @{
	const context = useContext(ToggleGroupContext);
	<ToggleGroupPrimitive.Item
		data-slot="toggle-group-item"
		data-variant={context.variant || variant}
		data-size={context.size || size}
		data-spacing={context.spacing}
		className={cn(
			'min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l',
			toggleVariants({
				variant: context.variant || variant,
				size: context.size || size,
			}),
			className,
		)}
		{...props}
	/>
}
