// Minimal FluidValue typing surface for public prop inference (runtime uses FrameValue).

export abstract class FluidValue<T = any> {
	abstract get(): T;
}

export type FluidProps<T> = T extends object
	? { [P in keyof T]: T[P] | FluidValue<Exclude<T[P], void>> }
	: unknown;
