export function useImmediateEffect(
	callback: () => void | (() => void),
	_dependencies?: any[] | null,
): void {
	callback();
}
