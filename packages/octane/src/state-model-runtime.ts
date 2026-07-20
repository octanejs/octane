/**
 * Compiler/runtime ABI for authored state-transition provenance.
 *
 * Old and unmarked output is deliberately permissive. New causal output stamps
 * component functions once at module evaluation and passes the numeric model to
 * stateful hooks as a compiler-only trailing argument.
 */

export const STATE_MODEL_PERMISSIVE = 0;
export const STATE_MODEL_CAUSAL = 1;

export type RuntimeStateModel = typeof STATE_MODEL_PERMISSIVE | typeof STATE_MODEL_CAUSAL;

type StateWriteContext = {
	active: boolean;
	depth: number;
	sourceModel: RuntimeStateModel;
	phase: number;
	source: Function | null;
};

const STATE_MODEL_CONTEXT = Symbol.for('octane.stateModel.context.v1');

/**
 * Synchronous state-write provenance shared by every Octane renderer and
 * compatible runtime copy loaded in this JavaScript realm. A DOM render can
 * call a universal binding (and vice versa), so renderer- or module-local
 * counters would leave a policy hole at precisely the cross-boundary point the
 * model is meant to protect.
 *
 * This is an internal mutable record rather than an exported public API. Each
 * renderer saves/restores its scalar fields around authored execution; keeping
 * one versioned realm-global record also avoids allocating a frame object on
 * every render.
 */
function getStateWriteContext(): StateWriteContext {
	const stateModelGlobal = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
	const existing = stateModelGlobal[STATE_MODEL_CONTEXT] as StateWriteContext | undefined;
	if (existing !== undefined) {
		return existing;
	}

	const context: StateWriteContext = {
		active: false,
		depth: 0,
		sourceModel: STATE_MODEL_PERMISSIVE,
		phase: 0,
		source: null,
	};
	stateModelGlobal[STATE_MODEL_CONTEXT] = context;
	return context;
}

export const STATE_WRITE_CONTEXT = getStateWriteContext();

const STATE_MODEL = Symbol.for('octane.stateModel');
const STATE_MODEL_TRANSPARENT = Symbol.for('octane.stateModel.transparent');

export function normalizeRuntimeStateModel(value: unknown): RuntimeStateModel {
	return value === STATE_MODEL_CAUSAL ? STATE_MODEL_CAUSAL : STATE_MODEL_PERMISSIVE;
}

/** Compiler-emitted definition-site stamp. */
export function markStateModel<T extends Function>(
	component: T,
	value: unknown,
	nameHint?: string,
): T {
	if (normalizeRuntimeStateModel(value) === STATE_MODEL_CAUSAL) {
		STATE_WRITE_CONTEXT.active = true;
		// Wrapping an anonymous function in a call suppresses JavaScript's inferred
		// name. The compiler supplies a hint only at syntax positions where the
		// unwrapped function would have received one.
		if (component.name === '' && typeof nameHint === 'string') {
			Object.defineProperty(component, 'name', {
				configurable: true,
				value: nameHint,
			});
		}
		Object.defineProperty(component, STATE_MODEL, {
			configurable: true,
			value: STATE_MODEL_CAUSAL,
		});
	}
	return component;
}

/**
 * Compiler helper for object-method definitions. Looking up own descriptors
 * preserves method syntax and [[HomeObject]] while avoiding getter execution.
 */
export function markStateModelMethods<T extends object>(
	object: T,
	value: unknown,
	...keys: PropertyKey[]
): T {
	if (normalizeRuntimeStateModel(value) !== STATE_MODEL_CAUSAL) return object;
	for (const key of keys) {
		const descriptor = Object.getOwnPropertyDescriptor(object, key);
		if (typeof descriptor?.value === 'function') {
			markStateModel(descriptor.value, value);
		}
	}
	return object;
}

export function stateModelOf(component: unknown): RuntimeStateModel {
	return typeof component === 'function' && (component as any)[STATE_MODEL] === STATE_MODEL_CAUSAL
		? STATE_MODEL_CAUSAL
		: STATE_MODEL_PERMISSIVE;
}

/** Runtime-owned component wrappers inherit the authored caller's provenance. */
export function markStateModelTransparent<T extends Function>(component: T): T {
	Object.defineProperty(component, STATE_MODEL_TRANSPARENT, {
		configurable: true,
		value: true,
	});
	return component;
}

export function isStateModelTransparent(component: unknown): boolean {
	return (
		typeof component === 'function' &&
		(component as { [STATE_MODEL_TRANSPARENT]?: boolean })[STATE_MODEL_TRANSPARENT] === true
	);
}
