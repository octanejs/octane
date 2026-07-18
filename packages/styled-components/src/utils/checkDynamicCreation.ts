// Octane adaptation: upstream detects styled() calls made during render by
// probing the React hook dispatcher (monkey-patching console.error around a
// throwaway useState call). Octane has no equivalent probe, so this uses a
// counting heuristic instead: constructing many components that share one
// displayName is the observable signature of in-render creation. The
// threshold matches warnTooManyClasses so both warnings describe the same
// runaway pattern.
const CREATION_LIMIT = 200;

const creationCounts: Map<string, number> = new Map();
const warned: Set<string> = new Set();

export const checkDynamicCreation = (displayName: string, componentId?: string | undefined) => {
	if (process.env.NODE_ENV !== 'production') {
		const count = (creationCounts.get(displayName) || 0) + 1;
		creationCounts.set(displayName, count);

		if (count >= CREATION_LIMIT && !warned.has(displayName)) {
			warned.add(displayName);
			const parsedIdString = componentId ? ` with the id of "${componentId}"` : '';
			console.warn(
				`The component ${displayName}${parsedIdString} has been created dynamically.\n` +
					"You may see this warning because you've called styled inside another component.\n" +
					'To resolve this only create new StyledComponents outside of any render method and function component.',
			);
		}
	}
};
