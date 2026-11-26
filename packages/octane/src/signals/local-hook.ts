/**
 * A component-local hook cell that a renderer without the DOM runtime provides
 * to the optional signal hooks. The universal renderer installs one with its
 * native-read support, so signal hooks reach it without importing either
 * renderer runtime.
 */
export type RendererLocalHook = <T>(
	name: string,
	initialize: () => T,
	dispose: (value: T) => void,
	slot?: unknown,
) => T;

let universalLocalHook: RendererLocalHook | null = null;

/** @internal Installed by `enableUniversalNativeReads`. */
export function installUniversalLocalHook(hook: RendererLocalHook): void {
	universalLocalHook = hook;
}

/** @internal The universal renderer's local hook, once a signals module enabled it. */
export function getUniversalLocalHook(): RendererLocalHook | null {
	return universalLocalHook;
}
