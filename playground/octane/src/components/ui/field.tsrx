// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/field.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis). Composes the Label and Separator ports.
// All class strings, the cva map, and every data-* attribute are byte-for-byte
// (including upstream's FieldTitle rendering data-slot="field-label").
//
// FieldSeparator and FieldError are composed with createElement: the
// consumer's opaque compiled children must sit beside sibling descriptors /
// inside a memoized content value, and opaque children can only flow through
// the props.children channel (see breadcrumb.tsrx's comment). Upstream's
// explicit useMemo dependency array is retained verbatim.
import { createElement, useMemo, type OctaneNode } from 'octane';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

type Props = { className?: string } & Record<string, unknown>;

export function FieldSet({ className, ...props }: Props) @{
	<fieldset
		data-slot="field-set"
		className={cn('cn-field-set flex flex-col', className)}
		{...props}
	/>
}

export function FieldLegend({ className, variant = 'legend', ...props }: Props & {
	variant?: 'legend' | 'label';
}) @{
	<legend
		data-slot="field-legend"
		data-variant={variant}
		className={cn('cn-field-legend', className)}
		{...props}
	/>
}

export function FieldGroup({ className, ...props }: Props) @{
	<div
		data-slot="field-group"
		className={cn(
			'cn-field-group group/field-group @container/field-group flex w-full flex-col',
			className,
		)}
		{...props}
	/>
}

const fieldVariants = cva('cn-field group/field flex w-full', {
	variants: {
		orientation: {
			vertical: 'cn-field-orientation-vertical flex-col *:w-full [&>.sr-only]:w-auto',
			horizontal: 'cn-field-orientation-horizontal flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
			responsive: 'cn-field-orientation-responsive flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
		},
	},
	defaultVariants: {
		orientation: 'vertical',
	},
});

export interface FieldProps extends Record<string, unknown> {
	className?: string;
	orientation?: VariantProps<typeof fieldVariants>['orientation'];
}

export function Field({ className, orientation = 'vertical', ...props }: FieldProps) @{
	<div
		role="group"
		data-slot="field"
		data-orientation={orientation}
		className={cn(fieldVariants({ orientation }), className)}
		{...props}
	/>
}

export function FieldContent({ className, ...props }: Props) @{
	<div
		data-slot="field-content"
		className={cn(
			'cn-field-content group/field-content flex flex-1 flex-col leading-snug',
			className,
		)}
		{...props}
	/>
}

export function FieldLabel({ className, ...props }: Props) @{
	<Label
		data-slot="field-label"
		className={cn(
			'cn-field-label group/field-label peer/field-label flex w-fit',
			'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col',
			className,
		)}
		{...props}
	/>
}

export function FieldTitle({ className, ...props }: Props) @{
	<div
		data-slot="field-label"
		className={cn('cn-field-title flex w-fit items-center', className)}
		{...props}
	/>
}

export function FieldDescription({ className, ...props }: Props) @{
	<p
		data-slot="field-description"
		className={cn(
			'cn-field-description leading-normal font-normal group-has-data-horizontal/field:text-balance',
			'last:mt-0 nth-last-2:-mt-1',
			'[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
			className,
		)}
		{...props}
	/>
}

export interface FieldSeparatorProps extends Record<string, unknown> {
	className?: string;
	children?: OctaneNode;
}

export function FieldSeparator({ children, className, ...props }: FieldSeparatorProps) {
	return createElement(
		'div',
		{
			'data-slot': 'field-separator',
			'data-content': !!children,
			className: cn('cn-field-separator relative', className),
			...props,
		},
		createElement(Separator, { key: 'separator', className: 'absolute inset-0 top-1/2' }),
		children
			? createElement(
					'span',
					{
						key: 'content',
						className: 'cn-field-separator-content relative mx-auto block w-fit bg-background',
						'data-slot': 'field-separator-content',
					},
					children,
				)
			: null,
	);
}

export interface FieldErrorProps extends Record<string, unknown> {
	className?: string;
	children?: OctaneNode;
	errors?: Array<{ message?: string } | undefined>;
}

export function FieldError({ className, children, errors, ...props }: FieldErrorProps) {
	const content = useMemo(() => {
		if (children) {
			return children;
		}

		if (!errors?.length) {
			return null;
		}

		const uniqueErrors = [
			...new Map(errors.map(
				(error): [string | undefined, { message?: string } | undefined] => [
					error?.message,
					error,
				],
			)).values(),
		];

		if (uniqueErrors?.length == 1) {
			return uniqueErrors[0]?.message;
		}

		return createElement(
			'ul',
			{ className: 'ml-4 flex list-disc flex-col gap-1' },
			// Falsy entries map to null: React skips `false` children, and null is
			// octane's "render nothing" value for renderable holes.
			uniqueErrors.map(
				(error, index) => error?.message
					? createElement('li', { key: index }, error.message)
					: null,
			),
		);
	}, [children, errors]);

	if (!content) {
		return null;
	}

	return createElement(
		'div',
		{
			role: 'alert',
			'data-slot': 'field-error',
			className: cn('cn-field-error font-normal', className),
			...props,
		},
		content,
	);
}
