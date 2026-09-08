/** A library-style reader whose reactive implementation lives behind a callback. */
export function formatCounter$(reader: { readCount$: () => number }): string {
	return 'value:' + reader.readCount$();
}
