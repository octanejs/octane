// Ported from @react-spring/types v10.1.2 (packages/types/src/interpolation.ts).
import type { Animatable } from './animated';
import type { Arrify, Constrain } from './utils';

export type ExtrapolateType = 'identity' | 'clamp' | 'extend';
export type EasingFunction = (value: number) => number;

export type InterpolatorFn<Input = any, Output = any> = (...inputs: Arrify<Input>) => Output;

export interface InterpolatorConfig<Output = Animatable> {
	range?: readonly number[];
	output: readonly Constrain<Output, Animatable>[];
	easing?: EasingFunction;
	extrapolate?: ExtrapolateType;
	extrapolateLeft?: ExtrapolateType;
	extrapolateRight?: ExtrapolateType;
	map?: (value: number) => number;
}
