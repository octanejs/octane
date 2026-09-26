declare global {
	interface Window {
		__shellOnlyEffectLoads?: number;
	}
}

export {};

// Imported by the shell-only helper, not by the live child. Removing its
// importer must not silently remove this observable module evaluation.
if (typeof window !== 'undefined') {
	window.__shellOnlyEffectLoads = (window.__shellOnlyEffectLoads ?? 0) + 1;
	(window.__shellEffectOrder ??= []).push('shell');
}
