import type { Interpolation } from '../core/Interpolation';
import type { FrameValue } from '../core/FrameValue';
import type { Animatable } from './animated';
import type { FluidValue } from './fluid';
import type { Arrify, Constrain, OneOrMore } from './utils';
import type { ExtrapolateType, InterpolatorConfig, InterpolatorFn } from './interpolation';

/** Extract the raw value types that are being interpolated */
export type Interpolated<T extends ReadonlyArray<any>> = {
	[P in keyof T]: T[P] extends infer Element
		? Element extends FluidValue<infer U>
			? U
			: Element extends FrameValue<infer U>
				? U
				: Element
		: never;
};

/**
 * This interpolates one or more fluid/frame values.
 */
export interface Interpolator {
	<Input extends ReadonlyArray<any>, Output>(
		parents: Input,
		interpolator: (...args: Interpolated<Input>) => Output,
	): Interpolation<Output>;

	<Input, Output>(
		parent: FluidValue<Input> | FrameValue<Input> | Input,
		interpolator: InterpolatorFn<Input, Output>,
	): Interpolation<Output>;

	<Out>(
		parents: OneOrMore<FluidValue<any> | FrameValue<any>>,
		config: InterpolatorConfig<Out>,
	): Interpolation<Animatable<Out>>;

	<Out>(
		parents:
			| OneOrMore<FluidValue<number> | FrameValue<number>>
			| FluidValue<number[]>
			| FrameValue<number[]>,
		range: readonly number[],
		output: readonly Constrain<Out, Animatable>[],
		extrapolate?: ExtrapolateType,
	): Interpolation<Animatable<Out>>;
}

// Re-export Arrify for InterpolatorFn consumers
export type { Arrify };
