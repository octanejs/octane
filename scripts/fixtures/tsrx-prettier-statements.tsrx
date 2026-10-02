// Formatter fixture for statements the TSRX Prettier plugin used to delete.
// `bun run format:check` must leave this file byte-identical, and
// scripts/tsrx-prettier-plugin.test.mjs checks that formatting keeps its AST.

function firstPositive(grid: number[][]): number {
	let first = -1;
	outer: for (const row of grid) {
		for (const cell of row) {
			if (cell > 0) {
				first = cell;
				break outer;
			}
			if (cell < 0) continue outer;
		}
	}
	return first;
}

function drain(queue: number[]): number {
	let count = 0;
	while (queue.shift() !== undefined);
	for (let i = 0; i < count; i++);
	if (count);
	else count++;
	// a labeled block, left early with `break`
	skip: {
		if (count > 1) break skip;
		count++;
	}
	a: b: while (count < 3) break a;
	empty:;
	return count;
}

export function Rows({ rows }: { rows: string[] }) @{
	<ul>
		@for (const row of rows; key row) {
			label: {
				if (row !== 'label') break label;
			}
			<li>{row}</li>
		}
	</ul>
}

export function Summary({ grid, queue }: { grid: number[][]; queue: number[] }) @{
	<p>{`${firstPositive(grid)}:${drain(queue)}`}</p>
}
