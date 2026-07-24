import type { VariantProps } from 'class-variance-authority';

export declare const badgeVariants: (props?: {
	variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link' | null;
	class?: unknown;
	className?: unknown;
}) => string;

export interface BadgeProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof badgeVariants>['variant'];
	asChild?: boolean;
	ref?: unknown;
}

export function Badge(props: BadgeProps): any;
