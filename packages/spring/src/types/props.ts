import type { SpringConfig } from '../core/SpringValue';
import type { SpringRef } from '../core/SpringRef';
import type { SpringValue } from '../core/SpringValue';
import type { Controller } from '../core/Controller';
import type { AnimationResult } from '../core/AnimationResult';
import type { FluidProps, FluidValue } from './fluid';
import type { IsPlainObject, RawValues, StringKeys } from './common';
import type {
	Any,
	Constrain,
	Falsy,
	Lookup,
	Merge,
	ObjectFromUnion,
	ObjectType,
	OneOrMore,
	Remap,
	UnknownProps,
} from './utils';

/** The phases of a `useTransition` item */
export type TransitionKey = 'initial' | 'enter' | 'update' | 'leave';

/**
 * Extract a union of animated values from a set of `useTransition` props.
 */
export type TransitionValues<Props extends object> = unknown &
	ForwardProps<
		ObjectFromUnion<
			Constrain<
				ObjectType<
					Props[TransitionKey & keyof Props] extends infer T
						? T extends ReadonlyArray<infer Element>
							? Element
							: T extends (...args: any[]) => infer Return
								? Return extends ReadonlyArray<infer ReturnElement>
									? ReturnElement
									: Return
								: T
						: never
				>,
				{}
			>
		>
	>;

/**
 * Move all non-reserved props into the `to` prop.
 */
export type InferTo<T extends object> = Merge<
	{ to: ForwardProps<T> },
	Pick<T, keyof T & keyof ReservedProps>
>;

export type SpringUpdate<T = any> = ToProps<T> & SpringProps<T>;

export type SpringsUpdate<State extends Lookup = UnknownProps> =
	| OneOrMore<ControllerUpdate<State>>
	| ((index: number, ctrl: Controller<State>) => ControllerUpdate<State> | null);

export interface SpringProps<T = any> extends AnimationProps<T> {
	from?: GoalValue<T>;
	loop?: LoopProp<SpringUpdate>;
	onProps?: EventProp<OnProps<T>>;
	onStart?: EventProp<OnStart<SpringValue<T>, SpringValue<T>>>;
	onChange?: EventProp<OnChange<SpringValue<T>, SpringValue<T>>>;
	onPause?: EventProp<OnPause<SpringValue<T>, SpringValue<T>>>;
	onResume?: EventProp<OnResume<SpringValue<T>, SpringValue<T>>>;
	onRest?: EventProp<OnRest<SpringValue<T>, SpringValue<T>>>;
}

export type ToProps<T = any> =
	| { to?: GoalProp<T> | SpringToFn<T> | SpringChain<T> }
	| ([T] extends [IsPlainObject<T>] ? InlineToProps<T> : never);

export type GoalProp<T> = [T] extends [IsPlainObject<T>] ? GoalValues<T> | Falsy : GoalValue<T>;

export type GoalValues<T> =
	FluidProps<T> extends infer Props ? { [P in keyof Props]?: Props[P] | null } : never;

export type GoalValue<T> = T | FluidValue<T> | UnknownProps | null | undefined;

export type InlineToProps<T = any> = Remap<GoalValues<T> & { to?: undefined }>;

export interface SpringChain<T = any> extends Array<
	[T] extends [IsPlainObject<T>] ? ControllerUpdate<T> : SpringTo<T> | SpringUpdate<T>
> {}

export type SpringTo<T = any> =
	| ([T] extends [IsPlainObject<T>] ? never : T | FluidValue<T>)
	| SpringChain<T>
	| SpringToFn<T>
	| Falsy;

export type ControllerUpdate<State extends Lookup = Lookup, Item = undefined> = unknown &
	ToProps<State> &
	ControllerProps<State, Item>;

export interface ControllerProps<
	State extends Lookup = Lookup,
	Item = undefined,
> extends AnimationProps<State> {
	ref?: SpringRef<State>;
	from?: GoalValues<State> | Falsy;
	loop?: LoopProp<ControllerUpdate>;
	onStart?:
		| OnStart<SpringValue<State>, Controller<State>, Item>
		| {
				[P in keyof State]?: OnStart<SpringValue<State[P]>, Controller<State>, Item>;
		  };
	onRest?:
		| OnRest<SpringValue<State>, Controller<State>, Item>
		| {
				[P in keyof State]?: OnRest<SpringValue<State[P]>, Controller<State>, Item>;
		  };
	onChange?:
		| OnChange<SpringValue<State>, Controller<State>, Item>
		| {
				[P in keyof State]?: OnChange<SpringValue<State[P]>, Controller<State>, Item>;
		  };
	onPause?:
		| OnPause<SpringValue<State>, Controller<State>, Item>
		| {
				[P in keyof State]?: OnPause<SpringValue<State[P]>, Controller<State>, Item>;
		  };
	onResume?:
		| OnResume<SpringValue<State>, Controller<State>, Item>
		| {
				[P in keyof State]?: OnResume<SpringValue<State[P]>, Controller<State>, Item>;
		  };
	onProps?: OnProps<State> | { [P in keyof State]?: OnProps<State[P]> };
	onResolve?: OnResolve<SpringValue<State>, Controller<State>, Item>;
}

export type LoopProp<T extends object> = boolean | T | (() => boolean | T);

export type MatchProp<T> = boolean | OneOrMore<StringKeys<T>> | ((key: StringKeys<T>) => boolean);

export type EventProp<T> = T | Lookup<T | undefined>;

export interface AnimationProps<T = any> {
	config?: SpringConfig | ((key: StringKeys<T>) => SpringConfig);
	delay?: number | ((key: StringKeys<T>) => number);
	immediate?: MatchProp<T>;
	cancel?: MatchProp<T>;
	pause?: MatchProp<T>;
	reset?: MatchProp<T>;
	reverse?: boolean;
	default?: boolean | SpringProps<T>;
}

export type ForwardProps<T extends object> = RawValues<Omit<Constrain<T, {}>, keyof ReservedProps>>;

export interface ReservedProps extends ReservedEventProps {
	config?: any;
	from?: any;
	to?: any;
	ref?: any;
	loop?: any;
	pause?: any;
	reset?: any;
	cancel?: any;
	reverse?: any;
	immediate?: any;
	default?: any;
	delay?: any;
	items?: any;
	trail?: any;
	sort?: any;
	expires?: any;
	initial?: any;
	enter?: any;
	update?: any;
	leave?: any;
	children?: any;
	keys?: any;
	callId?: any;
	parentId?: any;
}

export interface ReservedEventProps {
	onProps?: any;
	onStart?: any;
	onChange?: any;
	onPause?: any;
	onResume?: any;
	onRest?: any;
	onResolve?: any;
	onDestroyed?: any;
}

export type PickAnimated<Props extends object, Fwd = true> = unknown &
	([Props] extends [Any]
		? Lookup
		: [object] extends [Props]
			? Lookup
			: ObjectFromUnion<
					Props extends { from: infer From }
						? | (From extends () => any ? ReturnType<From> : ObjectType<From>)
							| (TransitionKey & keyof Props extends never
									? ToValues<Omit<Props, 'from'>, Fwd>
									: TransitionValues<Omit<Props, 'from'>>)
						: TransitionKey & keyof Props extends never
							? ToValues<Props, Fwd>
							: TransitionValues<Props>
				>);

export type ToValues<Props extends object, AndForward = true> = unknown &
	(AndForward extends true ? ForwardProps<Props> : unknown) &
	(Props extends { to?: any }
		? Exclude<Props['to'], Function | ReadonlyArray<any>> extends infer To
			? ForwardProps<[To] extends [object] ? To : Partial<Extract<To, object>>>
			: never
		: unknown);

export interface SpringToFn<T = any> {
	(start: any, stop: any): Promise<any> | void;
}

type EventHandler<TResult = any, TSource = unknown, Item = undefined> = (
	result: AnimationResult<TResult extends { get(): infer U } ? U : any>,
	ctrl: TSource,
	item?: Item,
) => void;

export type OnStart<TResult = any, TSource = unknown, Item = undefined> = EventHandler<
	TResult,
	TSource,
	Item
>;
export type OnChange<TResult = any, TSource = unknown, Item = undefined> = EventHandler<
	TResult,
	TSource,
	Item
>;
export type OnPause<TResult = any, TSource = unknown, Item = undefined> = EventHandler<
	TResult,
	TSource,
	Item
>;
export type OnResume<TResult = any, TSource = unknown, Item = undefined> = EventHandler<
	TResult,
	TSource,
	Item
>;
export type OnRest<TResult = any, TSource = unknown, Item = undefined> = EventHandler<
	TResult,
	TSource,
	Item
>;
export type OnResolve<TResult = any, TSource = unknown, Item = undefined> = EventHandler<
	TResult,
	TSource,
	Item
>;

export type OnProps<T = unknown> = (
	props: Readonly<SpringProps<T>>,
	spring: SpringValue<T>,
) => void;

/**
 * Update the props of a `Controller` object or `useSpring` call.
 */
export type SpringUpdateFn<T = any> =
	T extends IsPlainObject<T>
		? {
				(to: SpringTo<T>, props?: ControllerProps<T>): Promise<AnimationResult<T>>;
				(props: InlineToProps<T> & ControllerProps<T>): Promise<AnimationResult<T>>;
				(props: { to?: GoalValues<T> | Falsy } & ControllerProps<T>): Promise<AnimationResult<T>>;
			}
		: {
				(to: SpringTo<T>, props?: SpringProps<T>): Promise<AnimationResult<T>>;
				(props: { to?: GoalValue<T> } & SpringProps<T>): Promise<AnimationResult<T>>;
			};
