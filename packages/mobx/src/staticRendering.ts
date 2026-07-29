let staticRendering = false;

export function enableStaticRendering(enable: boolean): void {
	staticRendering = enable;
}

/** @deprecated Use enableStaticRendering instead. */
export const useStaticRendering = enableStaticRendering;

export function isUsingStaticRendering(): boolean {
	return staticRendering;
}
