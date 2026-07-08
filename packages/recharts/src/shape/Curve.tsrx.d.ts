// Type declaration for the .tsrx component (resolved by relative path).
export interface CurvePoint {
	x: number | null;
	y: number | null;
}
export type CurveType =
	| 'basis'
	| 'basisClosed'
	| 'basisOpen'
	| 'bump'
	| 'bumpX'
	| 'bumpY'
	| 'linear'
	| 'linearClosed'
	| 'monotone'
	| 'monotoneX'
	| 'monotoneY'
	| 'natural'
	| 'step'
	| 'stepAfter'
	| 'stepBefore'
	| ((...args: unknown[]) => unknown);
export interface CurveProps {
	type?: CurveType;
	points?: ReadonlyArray<CurvePoint>;
	baseLine?: number | ReadonlyArray<CurvePoint>;
	layout?: 'horizontal' | 'vertical';
	connectNulls?: boolean;
	path?: string;
	pathRef?: unknown;
	className?: unknown;
	[key: string]: unknown;
}
export declare const defaultCurveProps: { connectNulls: boolean; type: 'linear' };
export declare const getPath: (input: {
	type?: CurveType;
	points?: ReadonlyArray<CurvePoint>;
	baseLine?: number | ReadonlyArray<CurvePoint>;
	layout?: 'horizontal' | 'vertical';
	connectNulls?: boolean;
}) => string | null;
export declare const Curve: (props: CurveProps) => unknown;
