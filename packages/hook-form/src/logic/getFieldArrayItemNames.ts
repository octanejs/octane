// Adapted from react-hook-form@7.88.0 src/logic/getFieldArrayItemNames.ts for Octane.
import type { InternalFieldName } from '../types';

export default (names: Set<InternalFieldName>, name: InternalFieldName) => {
	const segments = name.split('.');
	const matches: InternalFieldName[] = [];
	let prefix = segments[0];

	for (let i = 1; i < segments.length; prefix += '.' + segments[i++]) {
		if (!isNaN(+segments[i]) && names.has(prefix)) {
			matches.push(`${prefix}.${segments[i]}`);
		}
	}

	return matches;
};
