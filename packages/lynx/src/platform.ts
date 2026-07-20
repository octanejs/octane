import { useLayoutEffect, useSyncExternalStore, withSlot } from 'octane/universal/native';

/** Runtime names used by the Rspeedy main/background specialization. */
export type LynxRuntime = 'background' | 'main-thread';

/** Platforms in the migration evidence matrix; this is not a support claim. */
export type LynxPlatform = 'android' | 'ios' | 'web';

/**
 * Module-scoped compatibility slice of the `@lynx-js/types@4.0.0` background
 * API plus the framework-maintained current `__initData` snapshot used by the
 * pinned ReactLynx update/reset contract. The upstream root type entry globally
 * augments JSX, so it cannot be imported by a renderer package that must
 * coexist with React types.
 */
export interface Lynx {
	__globalProps: GlobalProps;
	/** Current page data when the framework/native update receiver publishes it. */
	__initData?: InitData;
	readonly __presetData: InitDataRaw;
	getJSModule<Module = unknown>(name: string): Module;
	getJSModule(name: 'GlobalEventEmitter'): LynxGlobalEventEmitter;
	reload(value: object, callback: () => void): void;
	reportError(error: string | Error, options?: LynxReportErrorOptions): void;
}

export interface LynxGlobalEventEmitter {
	addListener(eventName: string, listener: (...args: unknown[]) => void, context?: object): void;
	removeListener(eventName: string, listener: (...args: unknown[]) => void): void;
	emit(eventName: string, data: unknown): void;
	removeAllListeners(eventName?: string): void;
	trigger(eventName: string, params: string | Record<PropertyKey, unknown>): void;
	toggle(eventName: string, ...data: unknown[]): void;
}

/**
 * Raw data accepted by {@link reload}. Applications may augment this interface
 * in `@octanejs/lynx/platform`.
 */
export interface InitDataRaw {}

/** Data returned by {@link useInitData}. Applications may augment this interface. */
export interface InitData {}

/** Global props returned by {@link useGlobalProps}. */
export interface GlobalProps {}

/**
 * Background-thread Native Modules. Applications augment this interface with
 * the modules registered by their Android/iOS host.
 */
export interface NativeModules {
	readonly LynxUIMethodModule?: {
		invokeUIMethod?(
			componentId: string,
			ancestors: string[],
			method: string,
			params: Record<string, unknown>,
			callback: (result: { code: number }) => void,
		): void;
	};
	readonly NetworkingModule?: unknown;
	readonly LynxTestModule?: unknown;
	readonly bridge: {
		call(
			name: string,
			params: Record<string, unknown>,
			callback: (...args: unknown[]) => void,
		): void;
		on(name: string, callback: (...args: unknown[]) => void): void;
	};
}

export interface LynxReportErrorOptions {
	readonly level?: 'error' | 'warning';
}

interface LynxPlatformGlobals {
	readonly lynx?: unknown;
	readonly NativeModules?: unknown;
}

interface PlatformDataStore<Data extends object> {
	readonly getSnapshot: () => Data;
	readonly subscribe: (listener: () => void) => () => void;
}

type PlatformDataField = '__initData' | '__globalProps';

const BACKGROUND_ONLY_MESSAGE =
	'@octanejs/lynx/platform is available only in the Lynx background runtime.';
const EMPTY_DATA = Object.freeze({});
const initDataStores = new WeakMap<object, PlatformDataStore<InitData>>();
const globalPropsStores = new WeakMap<object, PlatformDataStore<GlobalProps>>();

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readPlatformGlobals(): LynxPlatformGlobals {
	return globalThis as unknown as LynxPlatformGlobals;
}

function readBackgroundLynx(): Lynx {
	const candidate = readPlatformGlobals().lynx;
	if (
		!isObject(candidate) ||
		typeof (candidate as unknown as { getJSModule?: unknown }).getJSModule !== 'function'
	) {
		throw new Error(BACKGROUND_ONLY_MESSAGE);
	}
	return candidate as unknown as Lynx;
}

function readGlobalEventEmitter(runtime: Lynx): LynxGlobalEventEmitter {
	const emitter = runtime.getJSModule('GlobalEventEmitter');
	if (
		!isObject(emitter) ||
		typeof emitter.addListener !== 'function' ||
		typeof emitter.removeListener !== 'function'
	) {
		throw new TypeError(
			'Octane Lynx requires the public GlobalEventEmitter addListener/removeListener APIs.',
		);
	}
	return emitter;
}

function copyData<Data extends object>(value: unknown, field: PlatformDataField): Data {
	if (value === undefined) return { ...EMPTY_DATA } as Data;
	if (!isObject(value)) {
		throw new TypeError(`Lynx ${field} must be an object.`);
	}
	return { ...value } as Data;
}

function shallowEqualData(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	for (const key of leftKeys) {
		if (!Object.prototype.hasOwnProperty.call(right, key) || !Object.is(left[key], right[key])) {
			return false;
		}
	}
	return true;
}

function eventData(args: readonly unknown[]): Record<string, unknown> | null {
	let value = args[0];
	// Lynx emitters in supported SDKs may deliver `emit(name, [payload])` either
	// as one callback argument or by spreading the payload array.
	if (args.length === 1 && Array.isArray(value) && value.length === 1) value = value[0];
	return isObject(value) ? value : null;
}

function normalizedError(value: unknown): Error {
	return value instanceof Error ? value : new Error(String(value));
}

function reportListenerError(runtime: Lynx, value: unknown): void {
	try {
		runtime.reportError(normalizedError(value));
	} catch {
		// One broken diagnostic bridge must not prevent the remaining public store
		// subscribers from observing the platform update.
	}
}

function createPlatformDataStore<Data extends object>(
	runtime: Lynx,
	field: PlatformDataField,
	eventName: 'onDataChanged' | 'onGlobalPropsChanged',
): PlatformDataStore<Data> {
	const readSource = (): unknown =>
		field === '__initData'
			? runtime.__initData === undefined
				? runtime.__presetData
				: runtime.__initData
			: runtime.__globalProps;
	let sourceSnapshot = copyData<Data>(readSource(), field);
	let snapshot = sourceSnapshot;
	let emitter: LynxGlobalEventEmitter | null = null;
	const subscribers = new Set<() => void>();

	const synchronizeSource = (): boolean => {
		const nextSource = copyData<Data>(readSource(), field);
		if (
			!shallowEqualData(
				sourceSnapshot as Record<string, unknown>,
				nextSource as Record<string, unknown>,
			)
		) {
			sourceSnapshot = nextSource;
			snapshot = nextSource;
			return true;
		}
		return false;
	};

	const notify = (...args: unknown[]): void => {
		const sourceChanged = synchronizeSource();
		if (!sourceChanged) {
			const patch = eventData(args);
			snapshot = {
				...(snapshot as Record<string, unknown>),
				...(patch ?? EMPTY_DATA),
			} as Data;
		}
		for (const subscriber of [...subscribers]) {
			try {
				subscriber();
			} catch (error) {
				reportListenerError(runtime, error);
			}
		}
	};

	return {
		getSnapshot() {
			synchronizeSource();
			return snapshot;
		},
		subscribe(listener) {
			if (typeof listener !== 'function') {
				throw new TypeError('Octane Lynx platform store listener must be a function.');
			}
			const first = subscribers.size === 0;
			subscribers.add(listener);
			if (first) {
				try {
					emitter = readGlobalEventEmitter(runtime);
					emitter.addListener(eventName, notify);
				} catch (error) {
					subscribers.delete(listener);
					emitter = null;
					throw error;
				}
			}
			let active = true;
			return () => {
				if (!active) return;
				active = false;
				subscribers.delete(listener);
				if (subscribers.size === 0 && emitter !== null) {
					const current = emitter;
					emitter = null;
					current.removeListener(eventName, notify);
				}
			};
		},
	};
}

function initDataStore(): PlatformDataStore<InitData> {
	const runtime = readBackgroundLynx();
	let store = initDataStores.get(runtime);
	if (store === undefined) {
		store = createPlatformDataStore<InitData>(runtime, '__initData', 'onDataChanged');
		initDataStores.set(runtime, store);
	}
	return store;
}

function globalPropsStore(): PlatformDataStore<GlobalProps> {
	const runtime = readBackgroundLynx();
	let store = globalPropsStores.get(runtime);
	if (store === undefined) {
		store = createPlatformDataStore<GlobalProps>(runtime, '__globalProps', 'onGlobalPropsChanged');
		globalPropsStores.set(runtime, store);
	}
	return store;
}

/** Return the existing public background-thread `lynx` global. */
export function getLynx(): Lynx {
	return readBackgroundLynx();
}

/** Return the existing background-thread Native Modules registry. */
export function getNativeModules(): NativeModules {
	readBackgroundLynx();
	const modules = readPlatformGlobals().NativeModules;
	if (!isObject(modules)) {
		throw new Error('Octane Lynx could not find the background-thread NativeModules global.');
	}
	return modules as unknown as NativeModules;
}

/** Read init data and rerender when Lynx publishes `onDataChanged`. */
export function useInitData(slot?: unknown): InitData {
	const store = initDataStore();
	return useSyncExternalStore(store.subscribe, store.getSnapshot, undefined, slot);
}

/** Subscribe to the complete init-data snapshot after each public data update. */
export function useInitDataChanged(callback: (data: InitData) => void, slot?: unknown): void {
	if (typeof callback !== 'function') {
		throw new TypeError('useInitDataChanged callback must be a function.');
	}
	const store = initDataStore();
	useLayoutEffect(
		() => store.subscribe(() => callback(store.getSnapshot())),
		[store, callback],
		slot,
	);
}

/** Read global props and rerender when Lynx publishes `onGlobalPropsChanged`. */
export function useGlobalProps(slot?: unknown): GlobalProps {
	const store = globalPropsStore();
	return useSyncExternalStore(store.subscribe, store.getSnapshot, undefined, slot);
}

/** Subscribe to the complete global-props snapshot after each public update. */
export function useGlobalPropsChanged(callback: (data: GlobalProps) => void, slot?: unknown): void {
	if (typeof callback !== 'function') {
		throw new TypeError('useGlobalPropsChanged callback must be a function.');
	}
	const store = globalPropsStore();
	useLayoutEffect(
		() => store.subscribe(() => callback(store.getSnapshot())),
		[store, callback],
		slot,
	);
}

/** Subscribe to one event on Lynx's public background GlobalEventEmitter. */
export function useLynxGlobalEventListener<Args extends readonly unknown[]>(
	eventName: string,
	listener: (...args: Args) => void,
	slot?: unknown,
): void {
	if (typeof eventName !== 'string' || eventName.length === 0) {
		throw new TypeError('useLynxGlobalEventListener eventName must be a non-empty string.');
	}
	if (typeof listener !== 'function') {
		throw new TypeError('useLynxGlobalEventListener listener must be a function.');
	}
	const emitter = readGlobalEventEmitter(readBackgroundLynx());
	const nativeListener = (...args: unknown[]) => listener(...(args as unknown as Args));
	const install = () => {
		emitter.addListener(eventName, nativeListener);
		return () => emitter.removeListener(eventName, nativeListener);
	};
	if (slot === undefined) {
		useLayoutEffect(install, [emitter, eventName, listener]);
	} else {
		withSlot(slot, () => useLayoutEffect(install, [emitter, eventName, listener], 'listener'));
	}
}

/**
 * Request a public Lynx page reload. This does not install or claim a native
 * reload receiver; native completion is reported only through `callback`.
 */
export function reload(data: object & InitDataRaw, callback: () => void = () => {}): void {
	if (!isObject(data)) throw new TypeError('Octane Lynx reload data must be an object.');
	if (typeof callback !== 'function') {
		throw new TypeError('Octane Lynx reload callback must be a function.');
	}
	const runtime = readBackgroundLynx();
	if (typeof runtime.reload !== 'function') {
		throw new Error('Octane Lynx requires the public background-thread lynx.reload() API.');
	}
	runtime.reload(data, callback);
}

/** Report an application error through Lynx's public background API. */
export function reportError(error: string | Error, options?: LynxReportErrorOptions): void {
	if (typeof error !== 'string' && !(error instanceof Error)) {
		throw new TypeError('Octane Lynx reportError expects a string or Error.');
	}
	const runtime = readBackgroundLynx();
	if (typeof runtime.reportError !== 'function') {
		throw new Error('Octane Lynx requires the public lynx.reportError() API.');
	}
	runtime.reportError(error, options);
}

/**
 * Source-level Milestone 4 boundary. Technical-preview availability remains
 * false until the documented native lifecycle and device gates are satisfied.
 */
export const lynxPlatformAvailability = {
	available: false,
	plannedMilestone: 4,
	implementedMilestone: 4,
	technicalPreviewMilestone: 5,
	status: 'source-test-only-native-lifecycle-gates-blocked',
} as const;

export type LynxPlatformAvailability = typeof lynxPlatformAvailability;
