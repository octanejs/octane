// Field — maintainer-supplied default-Tailwind flavor, class strings verbatim.
// Octane adaptations: "use client" dropped; Label/Separator come from the
// package's own ports; FieldSeparator and FieldError compose their conditional
// children with createElement (a `children && …` branch beside a sibling
// descriptor), everything else is template JSX.
import { createElement, useMemo, type OctaneNode } from 'octane';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';
import { Label } from './label.tsrx';
import { Separator } from './separator.tsrx';

type Props = { className?: string; children?: OctaneNode } & Record<string, unknown>;

export function FieldSet({ className, ...props }: Props) @{
	<fieldset
		data-slot="field-set"
		className={cn(
			'flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3',
			className,
		)}
		{...props}
	/>
}

export function FieldLegend({ className, variant = 'legend', ...props }: Props & {
	variant?: 'legend' | 'label';
}) @{
	<legend
		data-slot="field-legend"
		data-variant={variant}
		className={cn(
			'mb-1.5 font-medium data-[variant=label]:text-sm data-[variant=legend]:text-base',
			className,
		)}
		{...props}
	/>
}

export function FieldGroup({ className, ...props }: Props) @{
	<div
		data-slot="field-group"
		className={cn(
			'group/field-group @container/field-group flex w-full flex-col gap-5 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4',
			className,
		)}
		{...props}
	/>
}

export const fieldVariants = cva(
	'group/field flex w-full gap-2 data-[invalid=true]:text-destructive',
	{
		variants: {
			orientation: {
				vertical: 'flex-col *:w-full [&>.sr-only]:w-auto',
				horizontal: 'flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
				responsive: 'flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
			},
		},
		defaultVariants: {
			orientation: 'vertical',
		},
	},
);

export function Field({ className, orientation = 'vertical', ...props }: Props & {
	orientation?: VariantProps<typeof fieldVariants>['orientation'];
}) @{
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
		className={cn('group/field-content flex flex-1 flex-col gap-0.5 leading-snug', className)}
		{...props}
	/>
}

export function FieldLabel({ className, ...props }: Props) @{
	<Label
		data-slot="field-label"
		className={cn(
			'group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-data-checked:border-primary/30 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border *:data-[slot=field]:p-2.5 dark:has-data-checked:border-primary/20 dark:has-data-checked:bg-primary/10',
			'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col',
			className,
		)}
		{...props}
	/>
}

export function FieldTitle({ className, ...props }: Props) @{
	<div
		data-slot="field-label"
		className={cn(
			'flex w-fit items-center gap-2 text-sm font-medium group-data-[disabled=true]/field:opacity-50',
			className,
		)}
		{...props}
	/>
}

export function FieldDescription({ className, ...props }: Props) @{
	<p
		data-slot="field-description"
		className={cn(
			'text-left text-sm leading-normal font-normal text-muted-foreground group-has-data-horizontal/field:text-balance [[data-variant=legend]+&]:-mt-1.5',
			'last:mt-0 nth-last-2:-mt-1',
			'[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
			className,
		)}
		{...props}
	/>
}

export function FieldSeparator({ children, className, ...props }: Props) {
	return createElement(
		'div',
		{
			'data-slot': 'field-separator',
			'data-content': !!children,
			className: cn(
				'relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2',
				className,
			),
			...props,
		},
		createElement(Separator, { key: 'rule', className: 'absolute inset-0 top-1/2' }),
		children
			? createElement(
					'span',
					{
						key: 'content',
						className: 'relative mx-auto block w-fit bg-background px-2 text-muted-foreground',
						'data-slot': 'field-separator-content',
					},
					children,
				)
			: null,
	);
}

export function FieldError(props: Props & { errors?: Array<{ message?: string } | undefined> }) {
	const { className, children: _children, errors: _errors, ...rest } = props;
	// Read through `props` inside the callback: octane's destructured-parameter
	// locals are not the value channel the compiler threads into a closure.
	const content = useMemo(() => {
		if (props.children) return props.children;
		const errors = props.errors;
		if (!errors?.length) return null;

		const uniqueErrors = [
			...new Map(errors.map((error) => [error?.message, error])).values(),
		];

		if (uniqueErrors?.length == 1) return uniqueErrors[0]?.message;

		return createElement(
			'ul',
			{ className: 'ml-4 flex list-disc flex-col gap-1' },
			uniqueErrors.map(
				(error, index) => error?.message
					? createElement('li', { key: index }, error.message)
					: null,
			),
		);
	});

	if (!content) return null;

	return createElement(
		'div',
		{
			role: 'alert',
			'data-slot': 'field-error',
			className: cn('text-sm font-normal text-destructive', className),
			...rest,
		},
		content,
	);
}
