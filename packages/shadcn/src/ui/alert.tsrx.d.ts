import type { VariantProps } from 'class-variance-authority';

export declare const alertVariants: (props?: {
	variant?: 'default' | 'destructive' | null;
	class?: unknown;
	className?: unknown;
}) => string;

export interface AlertProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof alertVariants>['variant'];
}

export function Alert(props: AlertProps): any;
export function AlertTitle(props: { className?: string } & Record<string, unknown>): any;
export function AlertDescription(props: { className?: string } & Record<string, unknown>): any;
export function AlertAction(props: { className?: string } & Record<string, unknown>): any;
