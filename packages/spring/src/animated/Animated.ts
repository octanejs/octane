// React-free graph node ported from react-spring v10.1.2 packages/animated/src/Animated.ts.
export abstract class Animated {
	getPayload(): AnimatedValue<any>[] | undefined {
		return undefined;
	}
	abstract getValue(): unknown;
}

export class AnimatedValue<T = number> extends Animated {
	constructor(private value: T) {
		super();
	}
	getValue(): T {
		return this.value;
	}
	setValue(value: T): boolean {
		if (Object.is(value, this.value)) return false;
		this.value = value;
		return true;
	}
	getPayload(): AnimatedValue<T>[] {
		return [this];
	}
}
