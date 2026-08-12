import type {
	CreateLynxMainThreadWorkletRegistryOptions,
	LynxActivatedMainThreadWorklet,
	LynxBackgroundFunctionDescriptor,
	LynxMainThreadCallBridge,
	LynxMainThreadRefCell,
	LynxMainThreadRefDescriptor,
	LynxMainThreadWorkletDescriptor,
	LynxMainThreadWorkletRegistry,
	LynxWorkletValue,
} from './worklets.js';

/**
 * The receiver-facing half of optional main-thread worklet support.
 *
 * This module deliberately has no value import from `worklets.ts`. Compiled
 * thread-function helpers provide the full feature from `main-worklets.ts`;
 * an application that emits none keeps only this small capability seam.
 */
export interface LynxMainThreadWorkletFeature {
	createRegistry(
		options: CreateLynxMainThreadWorkletRegistryOptions,
	): LynxMainThreadWorkletRegistry;
	installRegistry(registry: LynxMainThreadWorkletRegistry): () => void;
	installCallBridge(bridge: LynxMainThreadCallBridge): () => void;
	isolateValue<T extends LynxWorkletValue>(value: T, label?: string): T;
	isBackgroundFunction(value: unknown): value is LynxBackgroundFunctionDescriptor;
}

type FeatureSubscriber = (feature: LynxMainThreadWorkletFeature) => void;

let providedFeature: LynxMainThreadWorkletFeature | null = null;
const subscribers = new Set<FeatureSubscriber>();

/** Compiler-emitted worklet helpers provide one process-wide implementation. */
export function provideLynxMainThreadWorkletFeature(feature: LynxMainThreadWorkletFeature): void {
	if (providedFeature === feature) return;
	if (providedFeature !== null) {
		throw new Error('Octane Lynx main-thread worklet feature was provided twice.');
	}
	providedFeature = feature;
	for (const subscriber of subscribers) subscriber(feature);
}

/** Receivers subscribe before authored modules evaluate, so static or late features can attach. */
export function subscribeLynxMainThreadWorkletFeature(subscriber: FeatureSubscriber): () => void {
	subscribers.add(subscriber);
	try {
		if (providedFeature !== null) subscriber(providedFeature);
	} catch (error) {
		subscribers.delete(subscriber);
		throw error;
	}
	return () => subscribers.delete(subscriber);
}

function unavailable(): never {
	throw new Error(
		'Octane Lynx received main-thread worklet state, but this bundle compiled no worklet feature.',
	);
}

/**
 * Keep the ordinary receiver's publication calls direct and monomorphic when
 * the optional feature is absent. Only worklet-specific operations reject.
 */
export function createUnavailableLynxMainThreadWorkletRegistry(): LynxMainThreadWorkletRegistry {
	return Object.freeze({
		activate(_descriptor: LynxMainThreadWorkletDescriptor): LynxActivatedMainThreadWorklet {
			return unavailable();
		},
		release(_descriptorOrToken: LynxActivatedMainThreadWorklet | number): void {},
		runWorklet(
			_descriptor: LynxMainThreadWorkletDescriptor,
			_params?: readonly unknown[],
		): unknown {
			return unavailable();
		},
		beginRefOwnerPublication(): void {},
		finishRefOwnerPublication(): void {},
		retainRef<T>(
			_descriptor: LynxMainThreadRefDescriptor,
			_initialValue: T,
		): LynxMainThreadRefCell<T> {
			return unavailable();
		},
		updateRef<T>(_descriptor: LynxMainThreadRefDescriptor, _value: T): void {
			unavailable();
		},
		releaseRef(_descriptor: LynxMainThreadRefDescriptor): void {},
		retainOwner(_descriptor: LynxMainThreadRefDescriptor): LynxMainThreadRefCell {
			return unavailable();
		},
		releaseOwner(_descriptor: LynxMainThreadRefDescriptor): void {},
		releaseOwners(): void {},
		isActive(_descriptorOrToken: LynxActivatedMainThreadWorklet | number): boolean {
			return false;
		},
		close(): void {},
	});
}

export interface LynxReplaceableMainThreadWorkletRegistry extends LynxMainThreadWorkletRegistry {
	replace(registry: LynxMainThreadWorkletRegistry): void;
}

/** Existing host containers keep this stable identity when a late chunk enables worklets. */
export function createReplaceableLynxMainThreadWorkletRegistry(
	initial: LynxMainThreadWorkletRegistry,
): LynxReplaceableMainThreadWorkletRegistry {
	let current = initial;
	return Object.freeze({
		replace(registry: LynxMainThreadWorkletRegistry) {
			current = registry;
		},
		activate(descriptor: LynxMainThreadWorkletDescriptor) {
			return current.activate(descriptor);
		},
		release(descriptorOrToken: LynxActivatedMainThreadWorklet | number) {
			current.release(descriptorOrToken);
		},
		runWorklet(descriptor: LynxMainThreadWorkletDescriptor, params?: readonly unknown[]) {
			return current.runWorklet(descriptor, params);
		},
		beginRefOwnerPublication() {
			current.beginRefOwnerPublication();
		},
		finishRefOwnerPublication() {
			current.finishRefOwnerPublication();
		},
		retainRef<T>(descriptor: LynxMainThreadRefDescriptor, initialValue: T) {
			return current.retainRef(descriptor, initialValue);
		},
		updateRef<T>(descriptor: LynxMainThreadRefDescriptor, value: T) {
			current.updateRef(descriptor, value);
		},
		releaseRef(descriptor: LynxMainThreadRefDescriptor) {
			current.releaseRef(descriptor);
		},
		retainOwner(descriptor: LynxMainThreadRefDescriptor) {
			return current.retainOwner(descriptor);
		},
		releaseOwner(descriptor: LynxMainThreadRefDescriptor) {
			current.releaseOwner(descriptor);
		},
		releaseOwners() {
			current.releaseOwners();
		},
		isActive(descriptorOrToken: LynxActivatedMainThreadWorklet | number) {
			return current.isActive(descriptorOrToken);
		},
		close() {
			current.close();
		},
	});
}
