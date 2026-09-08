const INDEX_THRESHOLD = 64;

export type CategoricalIndex<Domain extends readonly string[]> = (key: Domain[number]) => number;

export default function createCategoricalIndex<Domain extends readonly string[]>(
	domain: Domain,
): CategoricalIndex<Domain> {
	if (domain.length < INDEX_THRESHOLD) {
		return (key) => domain.indexOf(key);
	}

	const indexes = new Map<string, number>();
	for (let index = 0; index < domain.length; index++) {
		const key = domain[index];
		if (indexes.get(key) === undefined) {
			indexes.set(key, index);
		}
	}

	return (key) => indexes.get(key) ?? -1;
}
