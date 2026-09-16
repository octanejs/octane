declare global {
	interface Window {
		__conversationBenchModules?: string[];
	}
}

export function recordEvaluation(name: string) {
	if (typeof window !== 'undefined') (window.__conversationBenchModules ??= []).push(name);
}
