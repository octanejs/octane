import type { VariantProps } from 'class-variance-authority';

export declare const tabsListVariants: (props?: {
	variant?: 'default' | 'line' | null;
	class?: unknown;
	className?: unknown;
}) => string;

export interface TabsProps extends Record<string, unknown> {
	className?: string;
	orientation?: 'horizontal' | 'vertical';
}

export interface TabsListProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof tabsListVariants>['variant'];
}

export interface TabsTriggerProps extends Record<string, unknown> {
	className?: string;
}

export interface TabsContentProps extends Record<string, unknown> {
	className?: string;
}

export function Tabs(props: TabsProps): any;
export function TabsList(props: TabsListProps): any;
export function TabsTrigger(props: TabsTriggerProps): any;
export function TabsContent(props: TabsContentProps): any;
