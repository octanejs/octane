import type { VariantProps } from 'class-variance-authority';

export declare const buttonVariants: (props?: {
	variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link' | null;
	size?: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg' | null;
	class?: unknown;
	className?: unknown;
}) => string;

export interface ButtonProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof buttonVariants>['variant'];
	size?: VariantProps<typeof buttonVariants>['size'];
	asChild?: boolean;
	ref?: unknown;
}

export function Button(props: ButtonProps): any;
