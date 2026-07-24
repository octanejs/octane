import type { OctaneNode } from 'octane';

type ToggleVariant = 'default' | 'outline' | null | undefined;
type ToggleSize = 'default' | 'sm' | 'lg' | null | undefined;

export interface ToggleGroupProps extends Record<string, unknown> {
	className?: string;
	variant?: ToggleVariant;
	size?: ToggleSize;
	spacing?: number;
	orientation?: 'horizontal' | 'vertical';
	children?: OctaneNode;
}

export interface ToggleGroupItemProps extends Record<string, unknown> {
	className?: string;
	variant?: ToggleVariant;
	size?: ToggleSize;
}

export function ToggleGroup(props: ToggleGroupProps): any;
export function ToggleGroupItem(props: ToggleGroupItemProps): any;
