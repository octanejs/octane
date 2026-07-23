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

/** Read Lynx from the official wrapper or an explicit global host. */
export function readLynxEnvironment(): unknown {
	return injectedLynx() ?? (globalThis as unknown as LynxAmbientGlobals).lynx;
}

/** Read Native Modules from the official wrapper or an explicit global host. */
export function readNativeModulesEnvironment(): unknown {
	return injectedNativeModules() ?? (globalThis as unknown as LynxAmbientGlobals).NativeModules;
}

/** Read the ambient scheduler without allocating a wrapper on platform-hook paths. */
export function readAmbientQueueMicrotask(): ((callback: () => void) => void) | undefined {
	return (globalThis as unknown as LynxAmbientGlobals).queueMicrotask;
}
