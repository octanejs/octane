/**
 * The bench's one read, shared by the tab and the worker so their contract
 * identities match. Its output is a Zod schema, as an app's would be, wrapped
 * to count each validation in the thread that runs it.
 */
import { read, type StandardSchema } from 'octane/data';
import { z } from 'zod';

const row = z.object({
	id: z.number(),
	title: z.string(),
	done: z.boolean(),
	tags: z.array(z.string()),
	updated: z.string(),
});
export type Row = z.infer<typeof row>;
const list = z.array(row);

export const counter = { calls: 0 };

const rowsSchema: StandardSchema<unknown, Row[]> = {
	'~standard': {
		version: 1,
		vendor: 'zod',
		validate(value) {
			counter.calls++;
			return list['~standard'].validate(value);
		},
	},
};

// Never stale on its own, so a first load served from the owner's memory or
// cache starts no refetch: each step's `refresh()` is the round's only request.
export const rows = read({ name: 'bench.rows', output: rowsSchema, fresh: Infinity });

export function makeRows(count: number, round: number): Row[] {
	return Array.from({ length: count }, (_, id) => ({
		id,
		title: `Row ${id} of round ${round}`,
		done: id % 3 === 0,
		tags: ['alpha', `tag-${id % 17}`],
		updated: new Date(Date.UTC(2026, 10, 25, 0, 0, round)).toISOString(),
	}));
}

/** The cache both sides name; the worker owns its storage. */
export const PARTITION = 'bench';
export const KEY = 'a session secret of at least sixteen bytes';
