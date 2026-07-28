interface LynxAmbientGlobals {
	readonly lynx?: unknown;
	readonly NativeModules?: unknown;
	readonly queueMicrotask?: (callback: () => void) => void;
	lynxCoreInject?: LynxCoreInject;
}

/** Private core injection carrying the engine's background event entry points. */
export interface LynxCoreInject {
	tt?: Record<string, unknown>;
}

// Rspeedy's official runtime wrapper provides these values as bundle-factory
// parameters. They are therefore lexical bindings in a native bundle, not
// properties on globalThis. The declarations disappear from emitted code while
// preserving the globalThis fallback used by tests and non-wrapped hosts.
declare const lynx: unknown;
declare const NativeModules: unknown;
declare const lynxCoreInject: LynxCoreInject | undefined;

// This package compiles without Node types on purpose: a native bundle has no
// Node globals. Rspeedy, Rspack, and Vite all substitute `process.env.NODE_ENV`
// with a literal, so the reference below folds to a constant and its guarded
// branches leave the emitted bundle entirely.
declare const process: { readonly env?: { readonly NODE_ENV?: string } } | undefined;

/**
 * Whether this is a development build.
 *
 * A native Lynx engine has no `process`, so an unsubstituted engine bundle
 * reads as production — which is what it is. Node-hosted source tests keep
 * `process`, so they exercise the development branches.
 */
export const LYNX_DEVELOPMENT: boolean =
	typeof process !== 'undefined' && process?.env?.NODE_ENV !== 'production';

function injectedLynx(): unknown {
	return typeof lynx === 'undefined' ? undefined : lynx;
}

/**
 * Resolve the object the engine calls background event entry points on.
 *
 * `lynxCoreInject` is a private core injection, so it can arrive either as a
 * wrapper-supplied lexical binding or as a property of the global object.
 * Prefer whichever already exists; otherwise create it on the global object,
 * which is where an engine that injects late will look.
 */
export function readLynxCoreInject(): LynxCoreInject {
	const injected = typeof lynxCoreInject === 'undefined' ? undefined : lynxCoreInject;
	if (injected !== undefined) return injected;
	const globals = globalThis as unknown as LynxAmbientGlobals;
	return (globals.lynxCoreInject ??= {});
}

function injectedNativeModules(): unknown {
	return typeof NativeModules === 'undefined' ? undefined : NativeModules;
}

function globalLynx(): unknown {
	return (globalThis as unknown as LynxAmbientGlobals).lynx;
}

/** Read Lynx from the official wrapper or an explicit global host. */
export function readLynxEnvironment(): unknown {
	return injectedLynx() ?? globalLynx();
}

/**
 * Report whether the wrapper supplied a lexical `lynx` the global object does
 * not expose. Only that host needs a synthetic root target; an ordinary global
 * host keeps `globalThis` itself, so no ambient binding becomes unreachable.
 */
export function lynxEnvironmentIsInjected(): boolean {
	const injected = injectedLynx();
	return injected !== undefined && injected !== globalLynx();
}

/** Read Native Modules from the official wrapper or an explicit global host. */
export function readNativeModulesEnvironment(): unknown {
	return injectedNativeModules() ?? (globalThis as unknown as LynxAmbientGlobals).NativeModules;
}

/**
 * Read the ambient scheduler bound to the global object. Hosts that implement
 * `queueMicrotask` as a global interface operation brand-check the receiver, so
 * the function must stay bound when a synthetic target re-homes it.
 */
export function readAmbientQueueMicrotask(): ((callback: () => void) => void) | undefined {
	const scheduler = (globalThis as unknown as LynxAmbientGlobals).queueMicrotask;
	return typeof scheduler === 'function' ? scheduler.bind(globalThis) : undefined;
}
