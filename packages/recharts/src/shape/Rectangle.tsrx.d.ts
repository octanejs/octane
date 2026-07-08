// Type declaration for the .tsrx component (resolved by relative path).
export interface RectangleProps {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	radius?: number | [number, number, number, number];
	className?: unknown;
	isAnimationActive?: boolean;
	isUpdateAnimationActive?: boolean;
	animationBegin?: number;
	animationDuration?: number;
	animationEasing?: string;
	[key: string]: unknown;
}
export declare const defaultRectangleProps: Required<
	Pick<
		RectangleProps,
		| 'x'
		| 'y'
		| 'width'
		| 'height'
		| 'radius'
		| 'isAnimationActive'
		| 'isUpdateAnimationActive'
		| 'animationBegin'
		| 'animationDuration'
		| 'animationEasing'
	>
>;
export declare const Rectangle: (props: RectangleProps) => unknown;
