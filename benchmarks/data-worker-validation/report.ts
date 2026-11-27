/**
 * The bench's lanes, steps and report, shared by the Node and Chromium
 * runners. A runner adds one round's samples per lane and step with `add`,
 * then calls `report`, which prints the table and fails the run when the
 * schema-call contract does not hold.
 */
import { writeFileSync } from 'node:fs';

export const LANES = ['page', 'worker'] as const;
export type Lane = (typeof LANES)[number];
export const STEPS = ['reply', 'restore'] as const;
export type Step = (typeof STEPS)[number];

export interface Sample {
	/** The tab's busy time, in ms. */
	busy: number;
	wall: number;
	pageCalls: number;
}
export interface WorkerStats {
	calls: number;
	saves: number;
	/** The replies the worker received over the wire, and their characters (see owner.ts). */
	replies: number;
	replyChars: number;
}

/** `--wire=json|devalue`: how replies reach the owner (see owner.ts); none by default. */
export function wireFrom(args: string[]): 'none' | 'json' | 'devalue' {
	const wire = args.find((arg) => arg.startsWith('--wire='))?.slice(7) ?? 'none';
	if (wire !== 'none' && wire !== 'json' && wire !== 'devalue')
		throw new Error(`--wire must be json or devalue, not ${wire}`);
	return wire;
}

export const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

const results = {} as Record<
	Lane,
	Record<Step, { busy: number[]; wall: number[]; pageCalls: number[] }>
>;
for (const lane of LANES)
	results[lane] = Object.fromEntries(
		STEPS.map((step) => [step, { busy: [], wall: [], pageCalls: [] }]),
	) as never;

/** Record one round of `lane`'s `step`, as the median of its samples. */
export function add(lane: Lane, step: Step, samples: Sample[]): void {
	const into = results[lane][step];
	into.busy.push(median(samples.map((sample) => sample.busy)));
	into.wall.push(median(samples.map((sample) => sample.wall)));
	// Every sample of a step must agree: the count is the step's contract.
	const counts = new Set(samples.map((sample) => sample.pageCalls));
	if (counts.size !== 1) throw new Error(`${lane} ${step}: page schema calls vary: ${[...counts]}`);
	into.pageCalls.push(samples[0]!.pageCalls);
}

export function report(options: {
	title: string;
	wire?: string;
	count: number;
	rounds: number;
	iterations: number;
	workers: Record<Lane, WorkerStats>;
}): void {
	const { title, count, rounds, iterations, workers } = options;
	const wire = options.wire ?? 'none';
	const rowsOut = STEPS.flatMap((step) =>
		LANES.map((lane) => {
			const { busy, wall, pageCalls } = results[lane][step];
			return { step, lane, pageCalls: pageCalls[0]!, busyMs: median(busy), wallMs: median(wall) };
		}),
	);
	console.log(
		`data-worker-validation (${title}, wire: ${wire}): ${count} rows, ${rounds} rounds × ${iterations} iterations, median of round medians\n`,
	);
	console.log('| Step | Lane | Tab schema calls | Tab busy (ms) | Wall (ms) | Busy ÷ page |');
	console.log('| --- | --- | ---: | ---: | ---: | ---: |');
	for (const row of rowsOut) {
		const page = rowsOut.find((other) => other.step === row.step && other.lane === 'page')!;
		console.log(
			`| ${row.step} | ${row.lane} | ${row.pageCalls} | ${row.busyMs.toFixed(2)} | ${row.wallMs.toFixed(2)} | ${(row.busyMs / page.busyMs).toFixed(2)} |`,
		);
	}
	console.log(
		`\nWorker schema calls: page lane ${workers.page.calls}, worker lane ${workers.worker.calls}.` +
			`\nWorker cache saves: page lane ${workers.page.saves}, worker lane ${workers.worker.saves}.` +
			(wire === 'none'
				? ''
				: `\nReply text: ${Math.round(workers.page.replyChars / workers.page.replies)} characters per reply.`),
	);

	// The work contract: the worker lane's tab never runs the schema; the page lane's runs it once per value.
	for (const step of STEPS) {
		const page = results.page[step].pageCalls[0];
		const worker = results.worker[step].pageCalls[0];
		if (page !== 1 || worker !== 0)
			throw new Error(
				`${step}: expected tab schema calls page 1, worker 0; got ${page}, ${worker}`,
			);
	}
	// And the worker runs it once per value only when it validates: a first load, then each step's iterations.
	const expected = rounds * (1 + STEPS.length * iterations);
	if (workers.page.calls !== 0 || workers.worker.calls !== expected)
		throw new Error(
			`expected worker schema calls page 0, worker ${expected}; got ${workers.page.calls}, ${workers.worker.calls}`,
		);
	if (process.env.BENCH_JSON)
		writeFileSync(
			process.env.BENCH_JSON,
			JSON.stringify({ runtime: title, wire, count, rows: rowsOut, workers }, null, 2),
		);
}
