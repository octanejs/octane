// Octane hook adapter for react-spring/packages/core/src/hooks at v10.1.2.
import { useLayoutEffect, useRef, useState } from 'octane';
import {
	Controller,
	type ControllerUpdate as RuntimeControllerUpdate,
	SpringRef,
	SpringValue,
	type SpringUpdate,
} from './engine';
import { inferTo } from './upstream-compat';
import { type SpringContextValue, useSpringContext } from './context';
import type { Valid } from './types/common';
import type { SpringValues } from './types/objects';
import type { ControllerUpdate, Lookup, PickAnimated, Remap } from './types/index';

export type TransitionPhase = 'mount' | 'enter' | 'update' | 'leave';

export type UseSpringProps<Props extends object = any> = unknown &
	PickAnimated<Props> extends infer State
	? State extends Lookup
		? Remap<
				ControllerUpdate<State> & {
					ref?: SpringRef<State>;
				}
			>
		: never
	: never;

export type UseTransitionProps<Item = any, State extends Lookup = Lookup> = Omit<
	ControllerUpdate<State, Item>,
	'from' | 'onResolve'
> & {
	keys?: ((item: Item) => string | number) | Array<string | number> | null;
	from?:
		| Partial<State>
		| null
		| false
		| ((item: Item, index: number) => Partial<State> | null | false | undefined)
		| Function;
	initial?:
		| Partial<State>
		| null
		| false
		| ((item: Item, index: number) => Partial<State> | null | false | undefined);
	enter?: Partial<State> | ((item: Item, index: number) => Partial<State> | undefined) | Function;
	update?: Partial<State> | ((item: Item, index: number) => Partial<State> | undefined) | Function;
	leave?: Partial<State> | ((item: Item, index: number) => Partial<State> | undefined) | Function;
	sort?: (a: Item, b: Item) => number;
	expires?: boolean | number | ((item: Item) => boolean | number);
	exitBeforeEnter?: boolean;
	trail?: number;
	reverse?: boolean;
	onDestroyed?: (item: Item, key: string | number) => void;
};

interface TransitionRecord<Item, State extends Record<string, any>> {
	key: string | number;
	item: Item;
	phase: TransitionPhase;
	controller: Controller<State>;
	lastUpdate?: RuntimeControllerUpdate<State>;
	expiration?: ReturnType<typeof setTimeout>;
}

function equalDeps(previous: any[] | undefined, next: any[] | undefined): boolean {
	return (
		previous !== undefined &&
		next !== undefined &&
		previous.length === next.length &&
		previous.every((value, index) => Object.is(value, next[index]))
	);
}

function equalValue(previous: any, next: any): boolean {
	if (Object.is(previous, next)) return true;
	if (
		previous === null ||
		next === null ||
		typeof previous !== 'object' ||
		typeof next !== 'object' ||
		Array.isArray(previous) !== Array.isArray(next)
	)
		return false;
	const previousKeys = Object.keys(previous);
	const nextKeys = Object.keys(next);
	return (
		previousKeys.length === nextKeys.length &&
		previousKeys.every((key) => Object.hasOwn(next, key) && equalValue(previous[key], next[key]))
	);
}

const subCache = new Map<symbol, Map<string, symbol>>();

function sub(slot: symbol | undefined, tag: string): symbol | undefined {
	if (slot === undefined) return undefined;
	let tags = subCache.get(slot);
	if (tags === undefined) subCache.set(slot, (tags = new Map()));
	let value = tags.get(tag);
	if (value === undefined) {
		value = Symbol.for(`${slot.description ?? 'react-spring'}:${tag}`);
		tags.set(tag, value);
	}
	return value;
}

function trailingSlot(args: any[]): symbol | undefined {
	const tail = args[args.length - 1];
	return typeof tail === 'symbol' ? tail : undefined;
}

function updateFrom<State extends Record<string, any>>(
	props: RuntimeControllerUpdate<State> | (() => RuntimeControllerUpdate<State>),
): RuntimeControllerUpdate<State> {
	return typeof props === 'function' ? props() : props;
}

function withContext<State extends Record<string, any>>(
	update: RuntimeControllerUpdate<State>,
	context: SpringContextValue,
): RuntimeControllerUpdate<State> {
	return { ...update, ...context } as RuntimeControllerUpdate<State>;
}

function sameLookup(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (
		left === null ||
		right === null ||
		typeof left !== 'object' ||
		typeof right !== 'object' ||
		typeof left === 'function' ||
		typeof right === 'function'
	) {
		return false;
	}
	const leftKeys = Object.keys(left as object);
	const rightKeys = Object.keys(right as object);
	if (leftKeys.length !== rightKeys.length) return false;
	return leftKeys.every(function sameKey(key) {
		return Object.is(
			(left as Record<string, unknown>)[key],
			(right as Record<string, unknown>)[key],
		);
	});
}

function sameSpringUpdate(
	left: RuntimeControllerUpdate<any>,
	right: RuntimeControllerUpdate<any>,
): boolean {
	return (
		sameLookup(left.to, right.to) &&
		sameLookup(left.from, right.from) &&
		sameLookup(left.config, right.config) &&
		Object.is(left.immediate, right.immediate) &&
		Object.is(left.delay, right.delay) &&
		Object.is(left.pause, right.pause) &&
		Object.is(left.cancel, right.cancel) &&
		Object.is(left.reset, right.reset) &&
		Object.is(left.loop, right.loop)
	);
}

export function useSpring<State extends Record<string, any>>(
	props: RuntimeControllerUpdate<State>,
): { [Key in keyof State]: SpringValue<State[Key]> };
export function useSpring<State extends Record<string, any>>(
	props: RuntimeControllerUpdate<State> | (() => RuntimeControllerUpdate<State>),
	deps: readonly any[] | undefined,
): [{ [Key in keyof State]: SpringValue<State[Key]> }, Controller<State>];
export function useSpring<Props extends object>(
	props: Function | (() => (Props & Valid<Props, UseSpringProps<Props>>) | UseSpringProps),
	deps?: readonly any[] | undefined,
): PickAnimated<Props> extends infer State
	? State extends Lookup
		? [SpringValues<State>, Controller<State>]
		: never
	: never;
export function useSpring<Props extends object>(
	props: (Props & Valid<Props, UseSpringProps<Props>>) | UseSpringProps,
): SpringValues<PickAnimated<Props>>;
export function useSpring<Props extends object>(
	props: (Props & Valid<Props, UseSpringProps<Props>>) | UseSpringProps,
	deps: readonly any[] | undefined,
): PickAnimated<Props> extends infer State
	? State extends Lookup
		? [SpringValues<State>, Controller<State>]
		: never
	: never;
export function useSpring(props: any, ...args: any[]): any {
	const slot = trailingSlot(args);
	const context = useSpringContext();
	const update = withContext(
		inferTo(updateFrom(props) as object) as RuntimeControllerUpdate<any>,
		context,
	);
	const [controller] = useState(
		function createController() {
			return new Controller(update as never);
		},
		sub(slot, 'controller'),
	);
	const deps = args.find(Array.isArray) as any[] | undefined;
	const functionProps = typeof props === 'function';
	const cached = useRef(update, sub(slot, 'cached'));
	if (functionProps || deps !== undefined || !sameSpringUpdate(cached.current, update)) {
		cached.current = update;
	}
	const effectUpdate = cached.current;
	useLayoutEffect(
		() => {
			void controller.start(effectUpdate);
		},
		deps === undefined
			? functionProps
				? [update, context]
				: [effectUpdate, context]
			: [...deps, context],
		sub(slot, 'effect'),
	);
	useLayoutEffect(
		() => () => {
			controller.stop(true);
		},
		[],
		sub(slot, 'cleanup'),
	);
	return functionProps || deps !== undefined
		? [controller.springs, controller]
		: controller.springs;
}

export function useSpringValue<T>(
	initial: T,
	propsOrSlot?: Omit<SpringUpdate<T>, 'to'> | symbol,
	...args: any[]
): SpringValue<T> {
	const slot = typeof propsOrSlot === 'symbol' ? propsOrSlot : trailingSlot(args);
	const props = typeof propsOrSlot === 'symbol' ? undefined : propsOrSlot;
	// Upstream: `new SpringValue(initial, props)` with constructor `default: true`.
	const [value] = useState(
		function createSpringValue() {
			return new SpringValue(initial, props);
		},
		sub(slot, 'value'),
	);
	useLayoutEffect(
		() => () => {
			value.stop(true);
		},
		[],
		sub(slot, 'cleanup'),
	);
	return value;
}

export function useSprings<State extends Record<string, any>>(
	length: number,
	props:
		| RuntimeControllerUpdate<State>[]
		| ((index: number, controller: Controller<State>) => RuntimeControllerUpdate<State>),
	...args: any[]
): [{ [Key in keyof State]: SpringValue<State[Key]> }[], SpringRef<State>] {
	const slot = trailingSlot(args);
	const context = useSpringContext();
	const [state] = useState(
		() => ({
			controllers: [] as Controller<State>[],
			ref: new SpringRef<State>(),
			updates: [] as RuntimeControllerUpdate<State>[],
			deps: undefined as any[] | undefined,
		}),
		sub(slot, 'state'),
	);
	const deps = args.find(Array.isArray) as any[] | undefined;
	const previousLength = state.controllers.length;
	while (state.controllers.length < length) {
		const controller = new Controller<State>();
		state.controllers.push(controller);
		state.ref.add(controller);
	}
	while (state.controllers.length > length) {
		const controller = state.controllers.pop()!;
		controller.stop(true);
		state.ref.delete(controller);
	}
	const functionProps = typeof props === 'function';
	const depsChanged = deps !== undefined && !equalDeps(state.deps, deps);
	if (!functionProps || depsChanged) {
		state.updates = state.controllers.map((controller, index) =>
			withContext(functionProps ? props(index, controller) : (props[index] ?? {}), context),
		);
	} else if (length > previousLength) {
		for (let index = previousLength; index < length; index++) {
			state.updates[index] = withContext(props(index, state.controllers[index]), context);
		}
	}
	state.updates.length = length;
	state.deps = deps?.slice();
	const updates = state.updates;
	useLayoutEffect(
		() => {
			updates.forEach((update, index) => void state.controllers[index].start(update));
		},
		[updates, context, length],
		sub(slot, 'effect'),
	);
	useLayoutEffect(
		() => () => state.controllers.forEach((controller) => controller.stop(true)),
		[],
		sub(slot, 'cleanup'),
	);
	return [state.controllers.map((controller) => controller.springs), state.ref];
}

export function useTrail<State extends Record<string, any>>(
	length: number,
	props: RuntimeControllerUpdate<State>,
): Array<{ [Key in keyof State]: SpringValue<State[Key]> }>;
export function useTrail<State extends Record<string, any>>(
	length: number,
	props: RuntimeControllerUpdate<State> | (() => RuntimeControllerUpdate<State>),
	deps: any[],
): [Array<{ [Key in keyof State]: SpringValue<State[Key]> }>, SpringRef<State>];
export function useTrail<State extends Record<string, any>>(
	length: number,
	props: () => RuntimeControllerUpdate<State>,
): [Array<{ [Key in keyof State]: SpringValue<State[Key]> }>, SpringRef<State>];
export function useTrail<State extends Record<string, any>>(
	length: number,
	props: RuntimeControllerUpdate<State> | (() => RuntimeControllerUpdate<State>),
	...args: any[]
):
	| Array<{ [Key in keyof State]: SpringValue<State[Key]> }>
	| [Array<{ [Key in keyof State]: SpringValue<State[Key]> }>, SpringRef<State>] {
	const slot = trailingSlot(args);
	const deps = args.find(Array.isArray) as any[] | undefined;
	const functionProps = typeof props === 'function';
	const nextUpdate = updateFrom(props);
	const [trailState] = useState(
		() => ({ update: nextUpdate, revision: {} }),
		sub(slot, 'trail-state'),
	);
	if (!equalValue(trailState.update, nextUpdate)) {
		trailState.update = nextUpdate;
		trailState.revision = {};
	}
	const result = useSprings(
		length,
		(index) => {
			const update = trailState.update;
			return {
				...update,
				delay: (update.delay ?? 0) + index * 16,
			};
		},
		deps ?? (functionProps ? [] : [trailState.revision]),
		slot,
	);
	return functionProps || deps !== undefined ? result : result[0];
}

export function useSpringRef<State extends Record<string, any>>(...args: any[]): SpringRef<State> {
	const slot = trailingSlot(args);
	return useState(() => new SpringRef<State>(), sub(slot, 'ref'))[0];
}

function resolveTransitionValue<Item, State extends Record<string, any>>(
	value: Partial<State> | ((item: Item, index?: number) => Partial<State>) | Function | undefined,
	item: Item,
	index = 0,
): Partial<State> | undefined {
	return typeof value === 'function'
		? (value as (item: Item, index: number) => Partial<State>)(item, index)
		: value;
}

function transitionTarget<State extends Record<string, any>>(
	value: Partial<State> | undefined,
): { to: Partial<State> | undefined; update: Partial<RuntimeControllerUpdate<State>> } {
	if (value === undefined) return { to: undefined, update: {} };
	const to: Record<string, any> = {};
	const update: Record<string, any> = {};
	const updateKeys = new Set([
		'cancel',
		'config',
		'delay',
		'immediate',
		'onChange',
		'onResolve',
		'onRest',
		'onStart',
		'pause',
		'reset',
	]);
	for (const [key, item] of Object.entries(value)) {
		(updateKeys.has(key) ? update : to)[key] = item;
	}
	return { to: to as Partial<State>, update };
}

export function useTransition<Item, Props extends object>(
	items: Item | readonly Item[],
	props: UseTransitionProps<Item> | (Props & Valid<Props, UseTransitionProps<Item>>),
	...args: any[]
): PickAnimated<Props> extends infer State
	? State extends Lookup
		? (
				render: (
					values: SpringValues<State>,
					item: Item,
					transition: { key: string | number; phase: TransitionPhase },
					index: number,
				) => unknown,
			) => unknown[]
		: never
	: never;
export function useTransition<Item = any, State extends Lookup = Lookup>(
	items: any,
	props: any,
	...args: any[]
): any {
	const slot = trailingSlot(args);
	const context = useSpringContext();
	const list = (Array.isArray(items) ? items : [items]).filter(
		(item): item is Item => item !== undefined && item !== null,
	);
	const [, forceUpdate] = useState(0, sub(slot, 'version'));
	const [transitionState] = useState(
		() => ({ props, context, revision: 0 }),
		sub(slot, 'transition-state'),
	);
	const transitionChanged =
		!equalValue(transitionState.props, props) || !equalValue(transitionState.context, context);
	if (transitionChanged) {
		transitionState.props = props;
		transitionState.context = context;
		transitionState.revision++;
	}
	const [records] = useState(
		() => [] as Array<TransitionRecord<Item, State>>,
		sub(slot, 'records'),
	);
	const nextKeys = list.map((item, index) =>
		typeof props.keys === 'function'
			? props.keys(item)
			: Array.isArray(props.keys)
				? props.keys[index]
				: ((item as any)?.key ?? (item as any)?.id ?? (item as any)),
	);
	const nextKeySet = new Set(nextKeys);

	for (const record of records) {
		if (!nextKeySet.has(record.key) && record.phase !== 'leave') record.phase = 'leave';
	}
	const hasLeaving = records.some((record) => record.phase === 'leave');
	list.forEach((item, index) => {
		const key = nextKeys[index]!;
		const existing = records.find((record) => record.key === key);
		if (existing !== undefined) {
			if (existing.expiration !== undefined) {
				clearTimeout(existing.expiration);
				existing.expiration = undefined;
			}
			const itemChanged = !equalValue(existing.item, item);
			existing.item = item;
			if (existing.phase === 'leave') existing.phase = 'enter';
			else if (itemChanged || transitionChanged) existing.phase = 'update';
			return;
		}
		if (props.exitBeforeEnter && hasLeaving) return;
		const from = (props.initial === null ? props.from : (props.initial ?? props.from)) as
			Partial<State> | undefined;
		records.push({
			key,
			item,
			phase: 'enter',
			controller: new Controller<State>({ from }),
		});
	});
	if (props.sort !== undefined) {
		records.sort((a, b) => props.sort!(a.item, b.item));
	} else {
		const active = nextKeys
			.map((key) => records.find((record) => record.key === key))
			.filter((record): record is TransitionRecord<Item, State> => record !== undefined);
		const leaving = records.filter((record) => !nextKeySet.has(record.key));
		records.splice(0, records.length, ...active, ...leaving);
	}

	const signature = `${transitionState.revision}|${records
		.map((record) => `${String(record.key)}:${record.phase}`)
		.join('|')}`;
	useLayoutEffect(
		() => {
			let active = true;
			for (const record of [...records]) {
				const target =
					record.phase === 'leave'
						? resolveTransitionValue(props.leave, record.item)
						: record.phase === 'update'
							? resolveTransitionValue(props.update ?? props.enter, record.item)
							: resolveTransitionValue(props.enter, record.item);
				const phase = record.phase;
				const phaseRecords = records.filter((candidate) => candidate.phase === phase);
				const phaseIndex = phaseRecords.indexOf(record);
				const trailIndex =
					phase === 'leave' && props.reverse ? phaseRecords.length - phaseIndex - 1 : phaseIndex;
				const payload = transitionTarget(target);
				const update = withContext(
					{
						to: payload.to,
						config: props.config,
						immediate: props.immediate,
						delay: (props.delay ?? 0) + (props.trail ?? 0) * trailIndex,
						cancel: props.cancel,
						pause: props.pause,
						onStart: props.onStart,
						onChange: props.onChange,
						onRest: props.onRest,
						onResolve: props.onResolve,
						...payload.update,
					},
					context,
				);
				if (equalValue(record.lastUpdate, update as RuntimeControllerUpdate<State>)) continue;
				record.lastUpdate = update as RuntimeControllerUpdate<State>;
				void record.controller.start(update as RuntimeControllerUpdate<State>).then(() => {
					if (!active || phase !== 'leave' || record.phase !== 'leave') return;
					const expiration =
						typeof props.expires === 'function'
							? props.expires(record.item)
							: (props.expires ?? true);
					const remove = () => {
						const index = records.indexOf(record);
						if (index >= 0) {
							records.splice(index, 1);
							props.onDestroyed?.(record.item, record.key);
							forceUpdate((value) => value + 1);
						}
					};
					if (typeof expiration === 'number' && expiration > 0)
						record.expiration = setTimeout(remove, expiration);
					else if (expiration !== false) remove();
				});
			}
			return () => {
				active = false;
			};
		},
		[signature],
		sub(slot, 'transition-effect'),
	);
	useLayoutEffect(
		() => () => {
			records.forEach((record) => {
				if (record.expiration !== undefined) clearTimeout(record.expiration);
				record.controller.stop(true);
			});
			records.length = 0;
		},
		[],
		sub(slot, 'transition-cleanup'),
	);

	return function renderTransitions(
		render: (
			values: SpringValues<State>,
			item: Item,
			transition: { key: string | number; phase: TransitionPhase },
			index: number,
		) => unknown,
	) {
		return records.map((record, index) =>
			render(
				record.controller.springs as SpringValues<State>,
				record.item,
				{ key: record.key, phase: record.phase },
				index,
			),
		);
	};
}

export function useChain(refs: SpringRef<any>[], ...args: any[]): void {
	const slot = trailingSlot(args);
	const rest = slot !== undefined ? args.slice(0, -1) : args;
	const timeSteps = Array.isArray(rest[0]) ? (rest[0] as number[]) : undefined;
	const timeFrame = typeof rest[1] === 'number' ? (rest[1] as number) : 1000;
	useLayoutEffect(
		() => {
			let active = true;
			if (timeSteps === undefined) {
				void refs.reduce(
					(sequence, ref) => sequence.then(() => (active ? ref.start() : undefined)),
					Promise.resolve<unknown>(undefined),
				);
				return () => {
					active = false;
				};
			}
			const timers = refs.map((ref, index) =>
				setTimeout(() => void ref.start(), (timeSteps[index] ?? 0) * timeFrame),
			);
			return () => timers.forEach(clearTimeout);
		},
		[refs, timeSteps, timeFrame],
		sub(slot, 'chain'),
	);
}
