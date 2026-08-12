export function syncTimeouts(callback: (...args: any[]) => unknown): number[] {
	const immediate = setTimeout(callback, 0);
	const short = setTimeout(callback, 10);
	const fallback = setTimeout(callback, 50);
	return [immediate, short, fallback];
}
