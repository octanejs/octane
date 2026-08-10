// Same word lists and row semantics as the Vue/React benchmark apps.
// Labels are plain strings (immutable state), matching apps/ui-react/src/data.ts.
let ID = 1;

function _random(max: number): number {
	return Math.round(Math.random() * 1000) % max;
}

export interface RowData {
	id: number;
	label: string;
}

const adjectives = [
	'pretty',
	'large',
	'big',
	'small',
	'tall',
	'short',
	'long',
	'handsome',
	'plain',
	'quaint',
	'clean',
	'elegant',
	'easy',
	'angry',
	'crazy',
	'helpful',
	'mushy',
	'odd',
	'unsightly',
	'adorable',
	'important',
	'inexpensive',
	'cheap',
	'expensive',
	'fancy',
];
const colours = [
	'red',
	'yellow',
	'blue',
	'green',
	'pink',
	'brown',
	'purple',
	'brown',
	'white',
	'black',
	'orange',
];
const nouns = [
	'table',
	'chair',
	'house',
	'bbq',
	'desk',
	'car',
	'pony',
	'cookie',
	'sandwich',
	'burger',
	'pizza',
	'mouse',
	'keyboard',
];

/**
 * Deterministic variant for the mount-create ladder — mirrors
 * packages/benchmark/shared/data.ts buildDataSeeded. Octane paints the first
 * screen on the main thread and re-renders it on the background thread, so
 * random labels would make every row a first-tree mismatch.
 */
export function buildDataSeeded(count = 1000): RowData[] {
	const data: RowData[] = [];
	for (let i = 0; i < count; i++) {
		data.push({
			id: ID++,
			label:
				adjectives[i % adjectives.length]! +
				' ' +
				colours[(i * 7) % colours.length]! +
				' ' +
				nouns[(i * 13) % nouns.length]!,
		});
	}
	return data;
}

export function buildData(count = 1000): RowData[] {
	const data: RowData[] = [];
	for (let i = 0; i < count; i++) {
		data.push({
			id: ID++,
			label:
				adjectives[_random(adjectives.length)]! +
				' ' +
				colours[_random(colours.length)]! +
				' ' +
				nouns[_random(nouns.length)]!,
		});
	}
	return data;
}
