// React-free behavioral port of react-spring v10.1.2 packages/core/src/Interpolation.ts.
import { createInterpolator } from '../shared/index';
import type { Interpolator } from '../types/interpolate';
import type { ExtrapolateType, InterpolatorConfig } from '../types/index';
import { FrameValue } from './FrameValue';

export class Interpolation<T = any> extends FrameValue<T> {
	private readonly cleanups: Array<() => void>;
	constructor(
		private readonly sources: Array<FrameValue<any>>,
		private readonly calc: (...values: any[]) => T,
	) {
		super();
		this.idle = sources.every((source) => source.idle);
		this.cleanups = sources.map((source) =>
			source.onChange(() => {
				this.idle = this.sources.every((parent) => parent.idle);
				this.emitChange(this.get());
			}),
		);
	}
	get(): T {
		return this.calc(...this.sources.map((source) => source.get()));
	}
	dispose(): void {
		for (const cleanup of this.cleanups) cleanup();
		this.cleanups.length = 0;
		this.listeners.clear();
		this.idle = true;
	}
}

export const to: Interpolator = function to(source: any, ...args: any[]): Interpolation<any> {
	if (args.length >= 2 && Array.isArray(args[0]) && Array.isArray(args[1])) {
		const range = args[0] as readonly number[];
		const output = args[1] as readonly unknown[];
		const extrapolate = args[2] as ExtrapolateType | undefined;
		return to(source, { range, output, extrapolate } as InterpolatorConfig);
	}
	const calc = args[0];
	const interpolate =
		typeof calc === 'function' ? calc : createInterpolator(calc as InterpolatorConfig);
	return new Interpolation(Array.isArray(source) ? source : [source], interpolate);
};

export const interpolate: Interpolator = to;
