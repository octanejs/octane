export type CountFunction = (idx: number, number: number) => number;
export type BinFunction = (idx: number, number?: number) => number;

export interface Bin {
	bin: number;
	count: number;
}

const defaultCount: CountFunction = (idx, number) => Math.random() * (25 * (number - idx));

const defaultBin: BinFunction = (idx, _length) => idx * 150;

export default function genBin(
	length: number,
	bin: BinFunction = defaultBin,
	count: CountFunction = defaultCount,
): Bin[] {
	return new Array(length).fill(1).reduce(
		(data, _d, i) =>
			data.concat([
				{
					bin: bin(i, length),
					count: count(i, length),
				},
			]),
		[],
	);
}
