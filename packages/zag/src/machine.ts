import type {
	ActionsOrFn,
	Bindable,
	BindableContext,
	BindableRefs,
	ChooseFn,
	ComputedFn,
	EffectsOrFn,
	GuardFn,
	Machine,
	MachineSchema,
	Params,
	Service,
} from '@zag-js/core';
import {
	createScope,
	findTransition,
	getExitEnterStates,
	hasTag,
	INIT_STATE,
	MachineStatus,
	matchesState,
	resolveStateValue,
} from '@zag-js/core';
import { callAll, compact, ensure, isFunction, isString, toArray, warn } from '@zag-js/utils';
import { flushSync, useMemo, useRef } from 'octane';

import { useBindable } from './bindable';
import { splitSlot, subSlot } from './internal';
import { useRefs } from './refs';
import { useTrack } from './track';
import { useSafeLayoutEffect } from './use-layout-effect';

export function useMachine<T extends MachineSchema>(
	machine: Machine<T>,
	userProps?: Partial<T['props']>,
): Service<T>;
export function useMachine<T extends MachineSchema>(...rawArgs: unknown[]): Service<T> {
	const [args, slot] = splitSlot(rawArgs);
	const [machine, suppliedProps = {}] = args as [Machine<T>, Partial<T['props']>?];
	const userProps = suppliedProps ?? {};

	const scope = useMemo(
		() => {
			const { id, ids, getRootNode } = userProps as any;
			return createScope({ id, ids, getRootNode });
		},
		[userProps],
		subSlot(slot, 'scope'),
	);

	const debug = (...args: any[]) => {
		if (machine.debug) console.log(...args);
	};

	const props: any = machine.props?.({ props: compact(userProps), scope }) ?? userProps;
	const prop = useProp(props, subSlot(slot, 'prop'));

	let bindableIndex = 0;
	let cleanupIndex = 0;
	let bindableRefIndex = 0;
	const bindable = Object.assign(
		<TValue>(params: () => any) =>
			useBindable<TValue>(params, subSlot(slot, `context-bindable:${bindableIndex++}`)),
		{
			cleanup: (fn: VoidFunction) =>
				useBindable.cleanup(fn, subSlot(slot, `context-cleanup:${cleanupIndex++}`)),
			ref: <TValue>(defaultValue: TValue) =>
				useBindable.ref(defaultValue, subSlot(slot, `context-ref:${bindableRefIndex++}`)),
		},
	) as typeof useBindable;

	const context = machine.context?.({
		prop,
		bindable,
		scope,
		flush,
		getContext() {
			return ctx as any;
		},
		getComputed() {
			return computed as any;
		},
		getRefs() {
			return refs as any;
		},
		getEvent() {
			return getEvent();
		},
	});

	const contextRef = useLiveRef<any>(context, subSlot(slot, 'context'));
	const ctx: BindableContext<T> = {
		get(key) {
			return contextRef.current?.[key].ref.current;
		},
		set(key, value) {
			contextRef.current?.[key].set(value);
		},
		initial(key) {
			return contextRef.current?.[key].initial;
		},
		hash(key) {
			const current = contextRef.current?.[key].ref.current;
			return contextRef.current?.[key].hash(current);
		},
	};

	const effects = useRef(new Map<string, VoidFunction>(), subSlot(slot, 'effects'));
	const transitionRef = useRef<any>(null, subSlot(slot, 'transition'));
	const previousEventRef = useRef<any>(null, subSlot(slot, 'previous-event'));
	const eventRef = useRef<any>({ type: '' }, subSlot(slot, 'event'));

	const getEvent = () => ({
		...eventRef.current,
		current() {
			return eventRef.current;
		},
		previous() {
			return previousEventRef.current;
		},
	});

	const getState = () => ({
		...state,
		matches(...values: T['state'][]) {
			return values.some((value) => matchesState(state.ref.current as string, value as string));
		},
		hasTag(tag: T['tag']) {
			return hasTag(machine, state.ref.current, tag);
		},
	});

	const refs: BindableRefs<T> = useRefs(
		machine.refs?.({ prop, context: ctx }) ?? {},
		subSlot(slot, 'refs'),
	);

	let trackIndex = 0;
	const track = (deps: any[], trackedEffect: VoidFunction) =>
		useTrack(deps, trackedEffect, subSlot(slot, `track:${trackIndex++}`));

	const getParams = (): Params<T> => ({
		state: getState(),
		context: ctx,
		event: getEvent(),
		prop,
		send,
		action,
		guard,
		track,
		refs,
		computed,
		flush,
		scope,
		choose,
	});

	const action = (keys: ActionsOrFn<T> | undefined) => {
		const strings = isFunction(keys) ? keys(getParams()) : keys;
		if (!strings) return;
		const functions = strings.map((key) => {
			const fn = machine.implementations?.actions?.[key];
			if (!fn) warn(`[zag-js] No implementation found for action "${JSON.stringify(key)}"`);
			return fn;
		});
		for (const fn of functions) fn?.(getParams());
	};

	const guard = (key: T['guard'] | GuardFn<T>) => {
		if (isFunction(key)) return key(getParams());
		const fn = machine.implementations?.guards?.[key];
		if (!fn) warn(`[zag-js] No implementation found for guard "${JSON.stringify(key)}"`);
		return fn?.(getParams());
	};

	const effect = (keys: EffectsOrFn<T> | undefined) => {
		const strings = isFunction(keys) ? keys(getParams()) : keys;
		if (!strings) return;
		const functions = strings.map((key) => {
			const fn = machine.implementations?.effects?.[key];
			if (!fn) warn(`[zag-js] No implementation found for effect "${JSON.stringify(key)}"`);
			return fn;
		});
		const cleanups: VoidFunction[] = [];
		for (const fn of functions) {
			const cleanup = fn?.(getParams());
			if (cleanup) cleanups.push(cleanup);
		}
		return () => cleanups.forEach((cleanup) => cleanup?.());
	};

	const choose: ChooseFn<T> = (transitions) =>
		toArray(transitions).find((transition) => {
			let result = !transition.guard;
			if (isString(transition.guard)) result = !!guard(transition.guard);
			else if (isFunction(transition.guard)) result = transition.guard(getParams());
			return result;
		});

	const computed: ComputedFn<T> = (key) => {
		ensure(machine.computed, () => '[zag-js] No computed object found on machine');
		const fn = machine.computed[key];
		return fn({
			context: ctx as any,
			event: getEvent(),
			prop,
			refs,
			scope,
			computed: computed as any,
		});
	};

	const state = useBindable(
		() => ({
			defaultValue: resolveStateValue(machine, machine.initialState({ prop })),
			onChange(nextState, previousState) {
				const { exiting, entering } = getExitEnterStates(
					machine,
					previousState,
					nextState,
					transitionRef.current?.reenter,
				);

				exiting.forEach((item) => {
					effects.current.get(item.path)?.();
					effects.current.delete(item.path);
				});
				exiting.forEach((item) => action(item.state?.exit));
				action(transitionRef.current?.actions);

				entering.forEach((item) => {
					const cleanup = effect(item.state?.effects);
					if (!cleanup) return;
					const existing = effects.current.get(item.path);
					effects.current.set(item.path, existing ? callAll(existing, cleanup) : cleanup);
				});

				if (previousState === INIT_STATE) {
					action(machine.entry);
					const cleanup = effect(machine.effects);
					if (cleanup) {
						const existing = effects.current.get(INIT_STATE);
						effects.current.set(INIT_STATE, existing ? callAll(existing, cleanup) : cleanup);
					}
				}

				entering.forEach((item) => action(item.state?.entry));
			},
		}),
		subSlot(slot, 'state'),
	);

	const hydratedStateRef = useRef<string | undefined>(undefined, subSlot(slot, 'hydrated-state'));
	const statusRef = useRef(MachineStatus.NotStarted, subSlot(slot, 'status'));

	useSafeLayoutEffect(
		() => {
			let cancelled = false;
			let didStart = false;
			queueMicrotask(() => {
				if (cancelled) return;
				const started = statusRef.current === MachineStatus.Started;
				didStart = true;
				statusRef.current = MachineStatus.Started;
				debug(started ? 'rehydrating...' : 'initializing...');
				const initialState = hydratedStateRef.current ?? state.initial!;
				state.invoke(initialState, started ? state.get() : INIT_STATE);
			});

			const functions = effects.current;
			return () => {
				cancelled = true;
				const currentState = getCurrentState();
				debug('unmounting...');
				hydratedStateRef.current = currentState;
				statusRef.current = MachineStatus.Stopped;
				functions.forEach((fn) => fn?.());
				effects.current = new Map();
				transitionRef.current = null;

				queueMicrotask(() => {
					if (didStart) action(machine.exit);
					statusRef.current = MachineStatus.Stopped;
				});
			};
		},
		[],
		subSlot(slot, 'lifecycle'),
	);

	const getCurrentState = () =>
		'ref' in state ? state.ref.current : (state as Bindable<string>).get();

	const send = (event: any) => {
		queueMicrotask(() => {
			if (statusRef.current !== MachineStatus.Started) return;

			previousEventRef.current = eventRef.current;
			eventRef.current = event;
			const currentState = getCurrentState();
			const { transitions, source } = findTransition(machine, currentState, event.type as string);
			const transition = choose(transitions);
			if (!transition) return;

			transitionRef.current = transition;
			const target = resolveStateValue(machine, transition.target ?? currentState, source);
			debug('transition', event.type, transition.target || currentState, `(${transition.actions})`);

			if (target !== currentState) {
				flushSync(() => state.set(target));
			} else if (transition.reenter) {
				state.invoke(currentState, currentState);
			} else {
				action(transition.actions ?? []);
			}
		});
	};

	machine.watch?.(getParams());

	return {
		state: getState(),
		send,
		context: ctx,
		prop,
		scope,
		refs,
		computed,
		event: getEvent(),
		getStatus: () => statusRef.current,
	} as Service<T>;
}

function useLiveRef<T>(value: T, slot: symbol) {
	const ref = useRef(value, slot);
	ref.current = value;
	return ref;
}

function useProp<T>(value: T, slot: symbol) {
	const ref = useLiveRef(value, slot);
	return function get<K extends keyof T>(key: K): T[K] {
		return ref.current[key];
	};
}

function flush(fn: VoidFunction) {
	queueMicrotask(() => {
		flushSync(() => fn());
	});
}
