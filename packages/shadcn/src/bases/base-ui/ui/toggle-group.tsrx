// Base UI base toggle-group — runs on @octanejs/base-ui's ToggleGroup.
//
// THERE IS NO `Item` PART. Verified by rendering the primitive: Base UI's ToggleGroup is a single
// component whose children are ordinary `Toggle`s carrying a `value`, where radix pairs
// `ToggleGroup.Root` with `ToggleGroup.Item`. So `ToggleGroupItem` here wraps `Toggle` — the same
// primitive `toggle.tsrx` uses — and the exported names and `data-slot` values stay as shadcn
// defines them, so consumers see no difference between bases.
//
// TWO API DIFFERENCES A CONSUMER CAN OBSERVE, both inherent to the primitive:
//
//   1. `type="single" | "multiple"` is translated to Base UI's `multiple` boolean, so markup
//      written against the radix base keeps working.
//
//   2. VALUES ARE ALWAYS ARRAYS. Base UI's `value` / `defaultValue` / `onValueChange` speak
//      `string[]` in both modes, where radix's single mode speaks a bare `string`. That is not
//      translated: faking a scalar would mean inventing conversion behavior on every change, and
//      silently reshaping the argument to the consumer's handler is worse than a documented
//      difference. Single mode still yields at most one entry.
//
// The pressed dialect is `data-pressed`, not radix's `data-[state=on]` — see toggle.tsrx, whose
// `toggleVariants` this file reuses, so the two bases cannot drift apart.
//
// ToggleGroup is composed with createElement: the consumer's children must sit INSIDE the context
// Provider, and opaque compiled .tsrx children can only flow through the props.children channel
// (see breadcrumb.tsrx's comment).
//
// UNVERIFIED PROVENANCE: class strings come from this package's radix base rather than
// transcribed from upstream's Base UI source.
import { createContext, createElement, useContext, type OctaneNode } from 'octane';
import { type VariantProps } from 'class-variance-authority';
import { ToggleGroup as ToggleGroupPrimitive } from '@octanejs/base-ui/toggle-group';
import { Toggle as TogglePrimitive } from '@octanejs/base-ui/toggle';

import { cn } from '../../../lib/utils';
import { toggleVariants } from './toggle.tsrx';

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
	type?: 'single' | 'multiple';
	children?: OctaneNode;
}

export function ToggleGroup({
	className,
	variant,
	size,
	spacing = 2,
	orientation = 'horizontal',
	type,
	children,
	...props
}: ToggleGroupProps) {
	return createElement(
		ToggleGroupPrimitive,
		{
			'data-slot': 'toggle-group',
			'data-variant': variant,
			'data-size': size,
			'data-spacing': spacing,
			// Forwarded to the primitive: it drives the arrow-key axis (a vertical group must
			// ignore left/right and use up/down). The primitive also emits `data-orientation`
			// itself, so unlike the radix base this is not set by hand.
			orientation,
			multiple: type === 'multiple',
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
	<TogglePrimitive
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
