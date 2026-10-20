/** Private provenance and dependency witnesses for unfinished initial hydration. */
import { hasOwnProp } from './has-own.js';
import { hydrating, pendingInitialHydrations } from './hydration-flag.js';
import { ARROW_HEAD } from './method-dep.js';
import type { componentSlot } from './runtime/component-slots.js';
import type { ComponentBody, Scope } from './runtime/types.js';

export type HydrationSourceWitness = readonly [source: object, revision: number];
let hydrationInputTuples: WeakMap<object, HydrationSourceWitness | null> | undefined;
// The first `methodCount` names denote direct calls whose receiver is the
// ephemeral props record; all names must be own data properties before setup.
type HydrationInputPlan = readonly [methodCount: number, ...required: string[]];
let hydrationInputComponents: WeakMap<object, HydrationInputPlan> | undefined;
let currentHydrationProps: object | null = null;
let currentHydrationPlan: HydrationInputPlan | null = null;

/** @internal Register the exact compiled callable and its required own fields. */
export function __registerHydrationInputComponent<T extends object>(
	component: T,
	required: HydrationInputPlan,
): T {
	(hydrationInputComponents ??= new WeakMap()).set(component, required);
	return component;
}

/** @internal Scope one fresh compiled JSX record to its synchronous invocation. */
export function __hydrationComponentSlot(
	writer: typeof componentSlot,
	scope: Scope,
	slot: number,
	parent: Node,
	component: ComponentBody | string,
	props: object,
	site?: string,
	anchor?: Node | null,
	localPlan?: HydrationInputPlan,
): void {
	let plan = localPlan;
	if (hydrating || pendingInitialHydrations > 0) {
		if (plan === undefined) {
			plan = hydrationInputComponents?.get(component as object);
			if (plan !== undefined) {
				// The compiler created this final object; never inspect the spread source.
				for (let index = 1; index < plan.length; index++) {
					const descriptor = Object.getOwnPropertyDescriptor(props, plan[index]!);
					if (!descriptor || !hasOwnProp.call(descriptor, 'value')) {
						plan = undefined;
						break;
					}
				}
			}
		}
		if (plan !== undefined) {
			const previousProps = currentHydrationProps;
			const previousPlan = currentHydrationPlan;
			currentHydrationProps = props;
			currentHydrationPlan = plan;
			try {
				return writer(scope, slot, parent, component, props, site, anchor);
			} finally {
				currentHydrationProps = previousProps;
				currentHydrationPlan = previousPlan;
			}
		}
	}
	writer(scope, slot, parent, component, props, site, anchor);
}

/** @internal Move one invocation's provenance to its private capture tuple. */
export function __captureHydrationInput<T extends unknown[]>(
	env: T,
	propsIndex: number,
	plan: HydrationInputPlan,
	closed = false,
	source?: () => HydrationSourceWitness | undefined,
): T {
	const props = env[propsIndex] as object;
	if (!closed) {
		if (currentHydrationProps !== props || currentHydrationPlan !== plan) return env;
		// Another boundary cannot claim this invocation, even if setup retired
		// the last pending adoption before reaching this one.
		currentHydrationProps = null;
		currentHydrationPlan = null;
	}
	if (!hydrating && pendingInitialHydrations === 0) return env;
	// Before the first arm can run, decline methods that could expose or mutate
	// their props receiver. An arrow cannot receive it.
	for (let index = 1; index <= plan[0]; index++) {
		const descriptor = Object.getOwnPropertyDescriptor(props, plan[index]!);
		if (!descriptor || !hasOwnProp.call(descriptor, 'value') || !isHydrationArrow(descriptor.value))
			return env;
	}
	let witness: HydrationSourceWitness | null = null;
	if (source !== undefined) {
		try {
			witness = source() ?? null;
		} catch {
			// A circular module can leave the imported binding uninitialized.
			return env;
		}
		if (witness === null) return env;
	}
	(hydrationInputTuples ??= new WeakMap()).set(env, witness);
	return env;
}

/** @internal Check provenance of the two compiler-owned capture tuples. */
export function __ownedHydrationInputs(previous: object, next: object, source = false): boolean {
	const tuples = hydrationInputTuples;
	if (tuples === undefined) return false;
	if (!source) return tuples.has(previous) && tuples.has(next);
	const left = tuples.get(previous);
	const right = tuples.get(next);
	return left != null && right != null && left[0] === right[0] && left[1] === right[1];
}

/** @internal Compare fields only on records proven to be compiler-created. */
export function __sameHydrationInput(
	previous: object,
	next: object,
	name: string,
	method = false,
): boolean {
	// An earlier arm may have mutated the record before suspending. Inspect
	// only its own descriptor: a missing field may now inherit from a Proxy,
	// and an accessor must stay in the authored render's error boundary.
	const left = Object.getOwnPropertyDescriptor(previous, name);
	const right = Object.getOwnPropertyDescriptor(next, name);
	if (
		!left ||
		!right ||
		!hasOwnProp.call(left, 'value') ||
		!hasOwnProp.call(right, 'value') ||
		!Object.is(left.value, right.value)
	)
		return false;
	return !method || isHydrationArrow(left.value);
}

function isHydrationArrow(value: unknown): boolean {
	if (typeof value !== 'function') return false;
	try {
		const source = Function.prototype.toString.call(value);
		// An async-prefixed source is ambiguous without reading the callback's
		// authored `name` property. Decline rather than invoke that getter here.
		return ARROW_HEAD.test(source) && (source[0] === '(' || !/^async\b/.test(source));
	} catch {
		return false;
	}
}
