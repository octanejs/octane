import type { ElementDescriptor } from 'octane';

export type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';
export type IconNode = readonly ['path', Readonly<Record<string, string>>][];
export type IconWeights = Readonly<Record<IconWeight, IconNode>>;

export interface SVGAttributes {
	[key: string]: any;
	alt?: string;
	class?: unknown;
	className?: string;
	color?: string;
	fill?: string;
	height?: string | number;
	id?: string;
	role?: string;
	style?: string | Record<string, string | number | null | undefined>;
	tabIndex?: number;
	viewBox?: string;
	width?: string | number;
}

export interface IconRefObject {
	current: SVGSVGElement | null;
}

export type IconRef =
	IconRefObject | ((instance: SVGSVGElement | null) => void) | readonly IconRef[] | null;

export interface IconProps extends SVGAttributes {
	children?: unknown;
	mirrored?: boolean;
	ref?: IconRef;
	size?: string | number;
	weight?: IconWeight;
}

export interface Icon {
	(props: IconProps): ElementDescriptor;
	displayName?: string;
}
