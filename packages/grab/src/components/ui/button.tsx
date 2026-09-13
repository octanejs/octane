/** @jsxImportSource octane */
import type { OctaneNode } from 'octane';
import { cn } from '../../utils/cn.js';
import { createVariants } from '../../utils/create-variants.js';

export const buttonVariants = createVariants(
	'contain-layout shrink-0 flex items-center justify-center cursor-pointer transition-all press-scale',
	{
		variants: {
			variant: {
				chip: 'px-[3px] py-px h-[17px] rounded-sm bg-[var(--rg-surface-hover)] [border-width:0.5px] border-solid border-[var(--rg-border-button)] hover:bg-[var(--rg-surface-active)] text-[var(--rg-text-primary)]',
				destructive:
					'px-[3px] py-px h-[17px] rounded-sm bg-[var(--rg-error-bg)] hover:bg-[var(--rg-error-bg-hover)] text-[var(--rg-error-text)]',
				ghost:
					'rounded-sm bg-transparent hover:bg-[var(--rg-surface-hover)] border-none outline-none p-0',
			},
		},
		defaultVariants: { variant: 'chip' },
	},
);

interface ButtonProps extends Record<string, unknown> {
	variant?: 'chip' | 'destructive' | 'ghost';
	class?: string;
	type?: 'button' | 'submit' | 'reset';
	children?: OctaneNode;
	onClick?: (event: MouseEvent) => void;
	disabled?: boolean;
	title?: string;
	style?: Record<string, string | number>;
}

export const Button = (props: ButtonProps) => {
	const { variant, class: className, type, children, ...rest } = props;
	return (
		<button type={type ?? 'button'} class={cn(buttonVariants({ variant }), className)} {...rest}>
			{children}
		</button>
	);
};
