declare global {
	interface Window {
		__shellSharedLoads?: number;
		__shellEffectOrder?: string[];
	}
}

// Both the shell and its live child use this module. It must remain in the
// client graph even if the shell's own code can be removed.
if (typeof window !== 'undefined') {
	window.__shellSharedLoads = (window.__shellSharedLoads ?? 0) + 1;
	(window.__shellEffectOrder ??= []).push('shared');
}

export function sharedLabel(value: string) {
	return `Shared: ${value}`;
}
