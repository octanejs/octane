// Type declaration for the .tsrx component (resolved by relative path).
export interface TrapezoidProps {
	x?: number;
	y?: number;
	upperWidth?: number;
	lowerWidth?: number;
	height?: number;
	className?: unknown;
	isUpdateAnimationActive?: boolean;
	animationBegin?: number;
	animationDuration?: number;
	animationEasing?: string;
	[key: string]: unknown;
}
export declare const defaultTrapezoidProps: Required<
	Pick<
		TrapezoidProps,
		| 'x'
		| 'y'
		| 'upperWidth'
		| 'lowerWidth'
		| 'height'
		| 'isUpdateAnimationActive'
		| 'animationBegin'
		| 'animationDuration'
		| 'animationEasing'
	>
>;
export declare const Trapezoid: (props: TrapezoidProps) => unknown;
