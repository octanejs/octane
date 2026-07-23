const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeVlqValue(value: string, cursor: { index: number }): number {
	let integer = 0;
	let shift = 0;
	while (cursor.index < value.length) {
		const digit = BASE64.indexOf(value[cursor.index++]);
		if (digit < 0) break;
		integer |= (digit & 31) << shift;
		if ((digit & 32) === 0) break;
		shift += 5;
	}
	const negative = (integer & 1) === 1;
	integer >>>= 1;
	return negative ? -integer : integer;
}

/** Decode Source Map v3 mappings into absolute segment fields per generated line. */
export function decodeMappings(mappings: string): number[][][] {
	let previousSource = 0;
	let previousOriginalLine = 0;
	let previousOriginalColumn = 0;
	return String(mappings ?? '')
		.split(';')
		.map((line) => {
			let previousGeneratedColumn = 0;
			const output: number[][] = [];
			for (const encoded of line === '' ? [] : line.split(',')) {
				const cursor = { index: 0 };
				const generatedColumn = previousGeneratedColumn + decodeVlqValue(encoded, cursor);
				previousGeneratedColumn = generatedColumn;
				if (cursor.index >= encoded.length) {
					output.push([generatedColumn]);
					continue;
				}
				previousSource += decodeVlqValue(encoded, cursor);
				previousOriginalLine += decodeVlqValue(encoded, cursor);
				previousOriginalColumn += decodeVlqValue(encoded, cursor);
				output.push([
					generatedColumn,
					previousSource,
					previousOriginalLine,
					previousOriginalColumn,
				]);
			}
			return output;
		});
}
