import { hasOwnProp } from '../has-own.js';
import type { InitialHydrationQueryInput } from '../runtime/suspense.js';
import { hasHydrationOwnerBrand } from './engine.js';
import { REACTIVE_DIRTY, REACTIVE_PENDING } from './graph-flags.js';
import {
	hasScopedNodeBrand,
	originalScopedNodeGet,
	originalScopedNodeStateGetter,
	ScopedNode,
} from './graph.js';
import { hydrationRequestGeneration, hydrationResourceWaiter } from './requests.js';
import { pendingWorld } from './transition-state.js';

const missing = Symbol();
const descriptor = Object.getOwnPropertyDescriptor;
const getPrototype = Object.getPrototypeOf;
const mapGet = Function.prototype.call.bind(Map.prototype.get) as (
	map: unknown,
	key: object,
) => unknown;
const setHas = Function.prototype.call.bind(Set.prototype.has) as (
	set: unknown,
	value: object,
) => boolean;

function object(value: unknown): value is object {
	return value !== null && typeof value === 'object';
}

function own(target: object, key: string): unknown {
	const field = descriptor(target, key);
	return field && hasOwnProp.call(field, 'value') ? field.value : missing;
}

interface QueryWitness {
	readonly source: object;
	readonly state: object;
	readonly entry: object;
	readonly authority: object;
	readonly generation: number;
	readonly attempt: object | undefined;
	readonly waiting: PromiseLike<unknown> | null;
}

function canonical(source: unknown): source is ScopedNode {
	if (
		pendingWorld !== undefined ||
		!object(source) ||
		!hasScopedNodeBrand(source) ||
		getPrototype(source) !== ScopedNode.prototype ||
		descriptor(source, 'get') !== undefined ||
		own(ScopedNode.prototype, 'get') !== originalScopedNodeGet ||
		descriptor(source, 'state') !== undefined
	)
		return false;
	const state = descriptor(ScopedNode.prototype, 'state');
	return (
		state !== undefined &&
		hasOwnProp.call(state, 'get') &&
		state.get === originalScopedNodeStateGetter &&
		own(source, 'kind') === 'async' &&
		own(source, 'pending') === undefined &&
		own(source, 'valueOnly') === false
	);
}

function selection(source: ScopedNode): QueryWitness | undefined {
	const flags = own(source, 'flags');
	const state = own(source, 'storedState');
	if (
		typeof flags !== 'number' ||
		(flags & (REACTIVE_DIRTY | REACTIVE_PENDING)) !== 0 ||
		own(source, 'evaluating') !== false ||
		!object(state)
	)
		return;
	const owner = own(source, 'owner');
	if (
		!object(owner) ||
		!hasHydrationOwnerBrand(owner) ||
		own(owner, 'disposed') !== false ||
		own(owner, 'readBarrier') !== undefined
	)
		return;
	let binding: unknown;
	try {
		binding = mapGet(own(owner, 'resources'), source);
	} catch {
		return;
	}
	if (!object(binding)) return;
	const waiting = hydrationResourceWaiter(binding);
	if (
		waiting === undefined ||
		own(binding, 'node') !== source ||
		own(binding, 'owner') !== owner ||
		descriptor(binding, 'candidate') !== undefined ||
		own(binding, 'streamedSelection') !== undefined
	)
		return;
	const entry = own(binding, 'selected');
	if (!object(entry)) return;
	const generation = hydrationRequestGeneration(entry);
	const authority = own(binding, 'selectionAuthority');
	const attempt = own(entry, 'attempt');
	if (attempt !== undefined && !object(attempt)) return;
	if (
		generation === undefined ||
		!object(authority) ||
		own(entry, 'owner') !== owner ||
		(waiting !== null && attempt === undefined) ||
		(waiting === null && own(entry, 'state') !== state)
	)
		return;
	try {
		if (!setHas(own(entry, 'consumers'), binding)) return;
	} catch {
		return;
	}
	return { source, state, entry, authority, generation, attempt, waiting };
}

/** @internal Capture only the first authored query call that actually throws its binding's waiter. */
export function __createHydrationQueryInput(): InitialHydrationQueryInput {
	const input: InitialHydrationQueryInput = {
		read(source) {
			const eligible = canonical(source);
			try {
				return source.get();
			} catch (waiting) {
				if (eligible && canonical(source)) {
					const found = selection(source);
					if (found && found.waiting !== null && found.waiting === waiting) {
						input.witness = found;
						input.waiting = found.waiting;
					}
				}
				throw waiting;
			}
		},
	};
	return input;
}

/** @internal Keep the original wake only while its exact query selection is still current. */
export function __retainsHydrationQueryInput(previous: unknown, source: unknown): boolean {
	const expected = previous as QueryWitness;
	if (expected.source !== source || !canonical(source)) return false;
	const next = selection(source);
	return (
		next !== undefined &&
		next.entry === expected.entry &&
		next.authority === expected.authority &&
		next.generation === expected.generation &&
		(next.waiting === null
			? next.attempt === undefined || next.attempt === expected.attempt
			: next.attempt === expected.attempt &&
				next.waiting === expected.waiting &&
				next.state === expected.state)
	);
}
