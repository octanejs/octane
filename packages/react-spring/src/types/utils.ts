// React-free subset of @react-spring/types v10.1.2 utils (no React element types).

/** Override the property types of `A` with `B` and merge any new properties */
export type Merge<A, B> = Remap<
	{ [P in keyof A]: P extends keyof B ? B[P] : A[P] } & Omit<B, keyof A>
>;

/** Better type errors for overloads with generic types */
export type Constrain<T, U> = [T] extends [Any] ? U : [T] extends [U] ? T : U;

/** Try to simplify `&` out of an object type */
export type Remap<T> = {} & {
	[P in keyof T]: T[P];
};

export type OneOrMore<T> = T | readonly T[];

export type Falsy = false | null | undefined;

export type NoInfer<T> = [T][T extends any ? 0 : never];

export interface Lookup<T = any> {
	[key: string]: T;
}

export type LoosePick<T, K> = {} & Pick<T, K & keyof T>;

/** Intersected with other object types to allow for unknown properties */
export interface UnknownProps extends Lookup<unknown> {}

/** Use `[T] extends [Any]` to know if a type parameter is `any` */
export class Any {
	// @ts-expect-error – dont worry about this.
	private _: never;
}

/** Ensure the given type is an object type */
export type ObjectType<T> = T extends object ? T : {};

/** Intersect a union of objects but merge property types with _unions_ */
export type ObjectFromUnion<T extends object> = Remap<{
	[P in keyof Intersect<T>]: T extends infer U ? (P extends keyof U ? U[P] : never) : never;
}>;

/** Convert a union to an intersection */
type Intersect<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void
	? I
	: never;

/** Ensure each type of `T` is an array */
export type Arrify<T> = [T, T] extends [infer T, infer DT]
	? DT extends ReadonlyArray<any>
		? Array<DT[number]> extends DT
			? ReadonlyArray<T extends ReadonlyArray<infer U> ? U : T>
			: DT
		: ReadonlyArray<T extends ReadonlyArray<infer U> ? U : T>
	: never;
