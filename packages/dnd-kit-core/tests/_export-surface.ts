/**
 * The runtime export surface of a module: each export name and the kind of
 * value under it. React's memo() wraps a component in an object, while Octane's
 * returns the component function, so both count as functions.
 */
export function exportSurface(module: object): Record<string, string> {
	return Object.fromEntries(
		Object.entries(module)
			.map(([name, value]): [string, string] => [
				name,
				typeof value === 'object' && value !== null && '$$typeof' in value
					? 'function'
					: typeof value,
			])
			.sort(([a], [b]) => a.localeCompare(b)),
	);
}
