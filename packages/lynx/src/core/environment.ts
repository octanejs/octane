interface LynxAmbientGlobals {
	readonly lynx?: unknown;
	readonly NativeModules?: unknown;
	readonly queueMicrotask?: (callback: () => void) => void;
}

// Rspeedy's official runtime wrapper provides these values as bundle-factory
// parameters. They are therefore lexical bindings in a native bundle, not
// properties on globalThis. The declarations disappear from emitted code while
// preserving the globalThis fallback used by tests and non-wrapped hosts.
declare const lynx: unknown;
declare const NativeModules: unknown;

function injectedLynx(): unknown {
	return typeof lynx === 'undefined' ? undefined : lynx;
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
