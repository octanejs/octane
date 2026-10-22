/** One compiler-scoped sheet, in lexical module order. CSS is host data. */
export interface UniversalStyleSheet {
	readonly id: string;
	readonly css: string;
}

/** Renderer ABI: replace a module's entire style set and return its cleanup. */
export type RegisterUniversalStyles = (
	moduleId: string,
	sheets: readonly UniversalStyleSheet[],
) => () => void;

/**
 * Create one registry per renderer realm. The host synchronously replaces all
 * sheets owned by moduleId, preserving array order; an empty array removes them.
 * Registration happens at module evaluation, never per component instance.
 * A stale disposer cannot remove a newer evaluation's sheets. Unmounting a root
 * does not release module styles; HMR disposal does. No browser APIs are used.
 */
export function createUniversalStyleRegistry(
	replace: (moduleId: string, sheets: readonly UniversalStyleSheet[]) => void,
): RegisterUniversalStyles {
	const owners = new Map<string, { sheets: readonly UniversalStyleSheet[] }>();
	return (moduleId, sheets) => {
		const previous = owners.get(moduleId);
		const owner = { sheets };
		if (
			!previous ||
			previous.sheets.length !== sheets.length ||
			previous.sheets.some(
				(sheet, index) => sheet.id !== sheets[index].id || sheet.css !== sheets[index].css,
			)
		) {
			replace(moduleId, sheets);
		}
		owners.set(moduleId, owner);
		return () => {
			if (owners.get(moduleId) !== owner) return;
			replace(moduleId, []);
			owners.delete(moduleId);
		};
	};
}
