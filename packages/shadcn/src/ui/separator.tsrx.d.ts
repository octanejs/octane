export interface SeparatorProps extends Record<string, unknown> {
	className?: string;
	orientation?: 'horizontal' | 'vertical';
	decorative?: boolean;
}

export function Separator(props: SeparatorProps): any;
