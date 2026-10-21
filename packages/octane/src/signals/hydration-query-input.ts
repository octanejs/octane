import { hasOwnProp } from '../has-own.js';
import { hydrating } from '../hydration-flag.js';
import { __ownedHydrationInputs } from '../hydration-inputs.js';
import { ScopeImpl } from './engine.js';
import { REACTIVE_DIRTY, REACTIVE_NONE, REACTIVE_PENDING } from './graph-flags.js';
import {
	hasScopedNodeBrand,
	originalScopedNodeGet,
	originalScopedNodeStateGetter,
	ScopedNode,
} from './graph.js';
import { RequestEntry, ResourceBinding } from './requests.js';
import { pendingWorld } from './transition-state.js';

/** None of the query-owned fields inspected here can validly be null. */
function ownValue(target: object, key: string): unknown {
	const descriptor = Object.getOwnPropertyDescriptor(target, key);
	return descriptor && hasOwnProp.call(descriptor, 'value') ? descriptor.value : null;
}

function object(value: unknown): value is object {
	return typeof value === 'object' && value !== null;
}

function nativeSource(value: unknown): value is ScopedNode {
	if (
		pendingWorld !== undefined ||
		!object(value) ||
		!hasScopedNodeBrand(value) ||
		Object.getPrototypeOf(value) !== ScopedNode.prototype ||
		Object.getOwnPropertyDescriptor(value, 'get') !== undefined ||
		ownValue(ScopedNode.prototype, 'get') !== originalScopedNodeGet ||
		Object.getOwnPropertyDescriptor(value, 'state') !== undefined ||
		Object.getOwnPropertyDescriptor(ScopedNode.prototype, 'state')?.get !==
			originalScopedNodeStateGetter
	)
		return false;
	const flags = ownValue(value, 'flags');
	return (
		typeof flags === 'number' &&
		flags !== REACTIVE_NONE &&
		(flags & (REACTIVE_DIRTY | REACTIVE_PENDING)) === 0 &&
		ownValue(value, 'kind') === 'async' &&
		ownValue(value, 'valueOnly') === false &&
		ownValue(value, 'evaluating') === false &&
		ownValue(value, 'pending') === undefined
	);
}

interface QueryInput {
	source: ScopedNode;
	owner: object;
	resources: unknown;
	binding: object;
	entry: object;
	consumers: unknown;
	authority: object;
	selection: unknown;
	attempt: object;
	generation: number;
	waiting: unknown;
}

function matches(input: QueryInput, source: unknown, allowSettled: boolean): boolean {
	const { owner, resources, binding, entry, consumers, authority, selection, attempt, generation } =
		input;
	if (
		source !== input.source ||
		!nativeSource(source) ||
		ownValue(source, 'owner') !== owner ||
		ownValue(owner, 'disposed') !== false ||
		ownValue(owner, 'readBarrier') !== undefined ||
		ownValue(owner, 'resources') !== resources ||
		Map.prototype.get.call(resources, source) !== binding ||
		ownValue(binding, 'owner') !== owner ||
		ownValue(binding, 'node') !== source ||
		Object.getOwnPropertyDescriptor(binding, 'candidate') !== undefined ||
		ownValue(binding, 'selected') !== entry ||
		ownValue(binding, 'selectionAuthority') !== authority ||
		ownValue(binding, 'streamedSelection') !== selection ||
		ownValue(entry, 'owner') !== owner ||
		ownValue(entry, 'consumers') !== consumers ||
		!Set.prototype.has.call(consumers, binding) ||
		// RequestEntry advances this field for both local and streamed attempts.
		ownValue(entry, 'generation') !== generation
	)
		return false;

	const currentAttempt = ownValue(entry, 'attempt');
	if (currentAttempt === attempt) {
		if (ownValue(attempt, 'entry') !== entry) return false;
	} else if (currentAttempt !== undefined || ownValue(attempt, 'entry') !== undefined) {
		return false;
	}
	if (ownValue(binding, 'describedAttempt') !== currentAttempt) return false;

	const state = ownValue(source, 'storedState');
	if (!object(state)) return false;
	const snapshot = ownValue(state, 'snapshot');
	if (!object(snapshot)) return false;
	const status = ownValue(snapshot, 'status');
	const pending = ownValue(binding, 'pendingPromise');
	if (pending === input.waiting)
		return (
			currentAttempt === attempt && status === 'pending' && ownValue(state, 'waiting') === pending
		);
	return (
		allowSettled &&
		pending === undefined &&
		state === ownValue(entry, 'state') &&
		(status === 'ready' || status === 'error')
	);
}

/** Capture a suspended native query without refreshing it or running its selector. */
function captureHydrationQueryInput(
	readSource: () => unknown,
	waiting: unknown,
): (() => boolean) | undefined {
	try {
		const source = readSource();
		if (waiting == null || !nativeSource(source)) return undefined;
		const owner = ownValue(source, 'owner');
		if (!object(owner) || Object.getPrototypeOf(owner) !== ScopeImpl.prototype) return undefined;
		const resources = ownValue(owner, 'resources');
		const binding = Map.prototype.get.call(resources, source);
		if (!object(binding) || Object.getPrototypeOf(binding) !== ResourceBinding.prototype)
			return undefined;
		const entry = ownValue(binding, 'selected');
		if (!object(entry) || Object.getPrototypeOf(entry) !== RequestEntry.prototype) return undefined;
		const authority = ownValue(binding, 'selectionAuthority');
		const selection = ownValue(binding, 'streamedSelection');
		const attempt = ownValue(entry, 'attempt');
		if (!object(authority) || (selection !== undefined && !object(selection)) || !object(attempt))
			return undefined;
		const generation = ownValue(attempt, 'generation');
		if (typeof generation !== 'number' || !Number.isSafeInteger(generation)) return undefined;
		const input: QueryInput = {
			source,
			owner,
			resources,
			binding,
			entry,
			consumers: ownValue(entry, 'consumers'),
			authority,
			selection,
			attempt,
			generation,
			waiting,
		};
		if (!matches(input, source, false)) return undefined;
		return () => {
			try {
				return matches(input, readSource(), true);
			} catch {
				return false;
			}
		};
	} catch {
		return undefined;
	}
}

interface QueryReadObservation {
	env: object;
	observed: boolean;
	thrown: unknown;
}

let queryReadObservation: QueryReadObservation | undefined;

/** @internal Scope one query read to an authenticated initial-hydration capture. */
export function __beginHydrationQueryRead(
	env: object | undefined,
	readSource: () => unknown,
): ((waiting?: unknown) => (() => boolean) | undefined) | undefined {
	if (!hydrating || !object(env) || !__ownedHydrationInputs(env, env)) return undefined;
	const previous = queryReadObservation;
	const observation: QueryReadObservation = { env, observed: false, thrown: undefined };
	queryReadObservation = observation;
	return (waiting) => {
		if (queryReadObservation !== observation) return undefined;
		queryReadObservation = previous;
		return waiting != null && observation.observed && observation.thrown === waiting
			? captureHydrationQueryInput(readSource, waiting)
			: undefined;
	};
}

/** @internal Run the authored read once and record its original thrown value. */
export function __readHydrationQueryInput<T>(env: object | undefined, read: () => T): T {
	const observation = hydrating ? queryReadObservation : undefined;
	if (observation === undefined || observation.env !== env || observation.observed) return read();
	observation.observed = true;
	try {
		return read();
	} catch (error) {
		observation.thrown = error;
		throw error;
	}
}
