// A resumed server attempt must never call this browser fallback in this fixture.
function unexpected(): never {
	document.documentElement.dataset.clientLoaderCalls = String(
		Number(document.documentElement.dataset.clientLoaderCalls ?? 0) + 1,
	);
	throw new Error('A browser loader ran instead of joining the SSR attempt');
}
export async function authorize(_signal: AbortSignal): Promise<string> {
	return unexpected();
}
export async function* watchBody(_signal: AbortSignal): AsyncGenerator<{
	revision: number;
	total: number;
	rows: { id: string; prompt: string; answer: string }[];
}> {
	yield unexpected();
}
export async function* watchHistory(_signal: AbortSignal): AsyncGenerator<{
	revision: number;
	total: number;
	rows: { id: string; title: string; preview: string }[];
}> {
	yield unexpected();
}
