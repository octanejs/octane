// Framework-neutral state shared by the scenarios and the test driver. The same
// module backs the Octane page and the React page, so both lists see the same rows,
// the same ref object and the same callback log.

export interface Row {
	id: string;
	label: string;
	height: number;
	type: 'short' | 'tall';
}

export function makeRows(count: number, start = 0, prefix = 'r'): Row[] {
	return Array.from({ length: count }, (_, offset) => {
		const n = start + offset;
		return {
			height: 40 + (n % 3) * 20,
			id: prefix + n,
			label: 'Row ' + n,
			type: n % 3 === 2 ? 'tall' : 'short',
		};
	});
}

interface Harness {
	ref: { current: any };
	actions: Record<string, (...args: any[]) => unknown>;
	log: unknown[][];
}

declare global {
	interface Window {
		__legend: Harness;
	}
}

export const harness: Harness = (window.__legend = {
	actions: {},
	log: [],
	ref: { current: null },
});

export function record(name: string, ...values: unknown[]) {
	harness.log.push([name, ...values]);
}
