import type { VariantProps } from 'class-variance-authority';

type DivProps = { className?: string } & Record<string, unknown>;

export declare const emptyMediaVariants: (props?: {
	variant?: 'default' | 'icon' | null;
	class?: unknown;
	className?: unknown;
}) => string;

export interface EmptyMediaProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof emptyMediaVariants>['variant'];
}

export function Empty(props: DivProps): any;
export function EmptyHeader(props: DivProps): any;
export function EmptyMedia(props: EmptyMediaProps): any;
export function EmptyTitle(props: DivProps): any;
export function EmptyDescription(props: DivProps): any;
export function EmptyContent(props: DivProps): any;
