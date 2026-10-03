/** A library-style reader whose reactive implementation lives behind a callback. */
export function formatCounter$(reader: { readCount$: () => number }): string {
	return 'value:' + reader.readCount$();
}

/** Library-style projections for a chained calculation over a reader. */
export function counterParts$(reader: { readCount$: () => number }): readonly number[] {
	return [reader.readCount$()];
}

export function boxValue<T>(value: T): { readonly value: T } {
	return { value };
}
