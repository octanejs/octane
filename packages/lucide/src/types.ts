import type { ElementDescriptor } from 'octane';
import type { LucideIconNode } from '@lucide/icons';
export type { LucideIconData, LucideIconNode } from '@lucide/icons';

export type SVGElementType =
	'circle' | 'ellipse' | 'g' | 'line' | 'path' | 'polygon' | 'polyline' | 'rect';

/** @deprecated Use LucideIconNode instead. */
export type IconNode = LucideIconNode[];

export interface SVGAttributes {
	[key: string]: any;
	class?: unknown;
	className?: string;
	color?: string;
	fill?: string;
	height?: string | number;
	id?: string;
	role?: string;
	stroke?: string;
	strokeLinecap?: string;
	strokeLinejoin?: string;
	strokeWidth?: string | number;
	style?: string | Record<string, string | number | null | undefined>;
	tabIndex?: number;
	viewBox?: string;
	width?: string | number;
}

export interface LucideRefObject {
	current: SVGSVGElement | null;
}

export type LucideRef =
	LucideRefObject | ((instance: SVGSVGElement | null) => void) | readonly LucideRef[] | null;

export interface LucideProps extends SVGAttributes {
	absoluteStrokeWidth?: boolean;
	nonScalingStroke?: boolean;
	children?: unknown;
	ref?: LucideRef;
	size?: string | number;
}

export interface LucideIcon {
	(props: LucideProps): ElementDescriptor;
	displayName?: string;
}

export interface LucideContext extends LucideProps {}
