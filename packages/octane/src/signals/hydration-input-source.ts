import { hasOwnProp } from '../has-own.js';
import type { HydrationSourceWitness } from '../hydration-inputs.js';
import { hasScopedNodeBrand, originalScopedNodeGet, ScopedNode } from './graph.js';
import { REACTIVE_NONE } from './graph-flags.js';
import { pendingWorld } from './transition-state.js';

function ownValue(target: object, name: string): unknown {
	const descriptor = Object.getOwnPropertyDescriptor(target, name);
	return descriptor && hasOwnProp.call(descriptor, 'value') ? descriptor.value : undefined;
}

/** @internal Snapshot an authentic writable source without reading its value. */
export function __hydrationSignalRevision(value: unknown): HydrationSourceWitness | undefined {
	if (
		pendingWorld !== undefined ||
		typeof value !== 'object' ||
		value === null ||
		!hasScopedNodeBrand(value) ||
		Object.getPrototypeOf(value) !== ScopedNode.prototype ||
		Object.getOwnPropertyDescriptor(value, 'get') !== undefined ||
		ownValue(ScopedNode.prototype, 'get') !== originalScopedNodeGet ||
		ownValue(value, 'kind') !== 'signal'
	)
		return undefined;
	const revision = ownValue(value, 'revision');
	const flags = ownValue(value, 'flags');
	const pending = Object.getOwnPropertyDescriptor(value, 'pending');
	if (
		typeof revision !== 'number' ||
		!Number.isFinite(revision) ||
		typeof flags !== 'number' ||
		flags === REACTIVE_NONE ||
		!pending ||
		!hasOwnProp.call(pending, 'value') ||
		pending.value !== undefined
	)
		return undefined;
	return [value, revision];
}
