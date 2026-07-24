import type { VariantProps } from 'class-variance-authority';

export declare const toggleVariants: (props?: {
	variant?: 'default' | 'outline' | null;
	size?: 'default' | 'sm' | 'lg' | null;
	class?: unknown;
	className?: unknown;
}) => string;

export interface ToggleProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof toggleVariants>['variant'];
	size?: VariantProps<typeof toggleVariants>['size'];
}

export function Toggle(props: ToggleProps): any;
