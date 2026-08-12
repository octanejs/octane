// Ported from react-spring v10.1.2 packages/animated/src/AnimatedArray.ts.
import { Animated, AnimatedValue } from './Animated';

export class AnimatedArray<T = unknown> extends Animated {
	readonly source: Array<AnimatedValue<T>>;
	constructor(source: readonly T[]) {
		super();
		this.source = source.map((value) => new AnimatedValue(value));
	}
	getValue(): T[] {
		return this.source.map((value) => value.getValue());
	}
	setValue(values: readonly T[]): boolean {
		let changed = values.length !== this.source.length;
		while (this.source.length < values.length)
			this.source.push(new AnimatedValue(values[this.source.length]!));
		this.source.length = values.length;
		values.forEach((value, index) => {
			changed = this.source[index]!.setValue(value) || changed;
		});
		return changed;
	}
	getPayload(): AnimatedValue<T>[] {
		return this.source;
	}
}
