declare const DIAGNOSTIC_SIGNAL_INITIALIZER: unique symbol;
export type DiagnosticSignalInitializer<T> = (() => T) & {
	readonly [DIAGNOSTIC_SIGNAL_INITIALIZER]: true;
};
const DIAGNOSTIC_SIGNAL_INITIALIZERS = /* @__PURE__ */ new WeakSet<() => unknown>();

/** @internal Private built-in useSignal$ adapter; not a public native-hook resource factory. */
export function createNativeSignalDiagnosticInitializer<T>(
	initialize: () => T,
): DiagnosticSignalInitializer<T> {
	DIAGNOSTIC_SIGNAL_INITIALIZERS.add(initialize);
	return initialize as DiagnosticSignalInitializer<T>;
}

export function isNativeSignalDiagnosticInitializer(value: () => unknown): boolean {
	return DIAGNOSTIC_SIGNAL_INITIALIZERS.has(value);
}
