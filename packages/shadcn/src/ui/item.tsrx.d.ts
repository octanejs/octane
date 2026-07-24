import type { VariantProps } from 'class-variance-authority';

type DivProps = { className?: string } & Record<string, unknown>;

export declare const itemVariants: (props?: {
	variant?: 'default' | 'outline' | 'muted' | null;
	size?: 'default' | 'sm' | 'xs' | null;
	class?: unknown;
	className?: unknown;
}) => string;

export declare const itemMediaVariants: (props?: {
	variant?: 'default' | 'icon' | 'image' | null;
	class?: unknown;
	className?: unknown;
}) => string;

export interface ItemProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof itemVariants>['variant'];
	size?: VariantProps<typeof itemVariants>['size'];
	asChild?: boolean;
}

export interface ItemMediaProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof itemMediaVariants>['variant'];
}

export function ItemGroup(props: DivProps): any;
export function ItemSeparator(props: DivProps): any;
export function Item(props: ItemProps): any;
export function ItemMedia(props: ItemMediaProps): any;
export function ItemContent(props: DivProps): any;
export function ItemTitle(props: DivProps): any;
export function ItemDescription(props: DivProps): any;
export function ItemActions(props: DivProps): any;
export function ItemHeader(props: DivProps): any;
export function ItemFooter(props: DivProps): any;
