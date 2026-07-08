// Type declaration for the .tsrx component (resolved by relative path).
export interface PolygonPoint {
	x: number;
	y: number;
}
export interface PolygonProps {
	points?: ReadonlyArray<PolygonPoint>;
	baseLinePoints?: ReadonlyArray<PolygonPoint>;
	connectNulls?: boolean;
	className?: unknown;
	[key: string]: unknown;
}
export declare const Polygon: (props: PolygonProps) => unknown;
