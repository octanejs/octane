import type { ElementDescriptor } from 'octane';

export interface SanityIconRefObject {
	current: SVGSVGElement | null;
}

export type SanityIconRef =
	| SanityIconRefObject
	| ((instance: SVGSVGElement | null) => void)
	| readonly SanityIconRef[]
	| null;

export interface SanityIconProps {
	[key: string]: any;
	children?: unknown;
	class?: unknown;
	className?: string;
	color?: string;
	fill?: string;
	height?: string | number;
	id?: string;
	onClick?: (event: MouseEvent) => void;
	ref?: SanityIconRef;
	role?: string;
	style?: string | Record<string, string | number | null | undefined>;
	tabIndex?: number;
	viewBox?: string;
	width?: string | number;
}

export interface IconComponent {
	(props?: SanityIconProps): ElementDescriptor;
	displayName?: string;
}
