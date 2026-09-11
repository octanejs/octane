import type { CSSProperties, ElementDescriptor } from 'octane';

export type SVGElementType =
	'circle' | 'ellipse' | 'g' | 'line' | 'path' | 'polygon' | 'polyline' | 'rect';

export type IconNode = [elementName: SVGElementType, attrs: Record<string, string>][];

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
	// `CSSProperties` belongs here because callers forward a style object typed by octane's own
	// JSX types (a component that passes its `style` prop straight through to an icon); the
	// runtime only spreads this onto the `<svg>`, so the wider type changes no behavior.
	style?: string | CSSProperties | Record<string, string | number | null | undefined>;
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
	children?: unknown;
	ref?: LucideRef;
	size?: string | number;
}

export interface LucideIcon {
	(props: LucideProps): ElementDescriptor;
	displayName?: string;
}

export interface LucideContext extends LucideProps {}
