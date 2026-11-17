/** What the data-on-signals benchmark runs, shared by the page and the runner. */

/** The row a single-record write changes. */
export const WRITTEN = 17;

/**
 * How a component reads the store:
 * - `hooks`: the shipped binding, `useRead(useDataStore().read(...))`;
 * - `hooks-on`: the same rows in an application that also uses signals, so
 *   the renderer collects native reads around every component render;
 * - `hooks-list`: (`field` only) one component reads the list and passes each
 *   row to a `memo` child, the selector-free way to keep a write to one row;
 * - `cells`: each read is a signal cell, read with `.get()` while rendering;
 * - `bound`: each read is a signal cell whose shown field is a `derived$`
 *   bound to its text node, so a write renders no component.
 */
const ALL = ['hooks', 'hooks-on', 'cells', 'bound'];

/**
 * - `rows`: every row reads its own record;
 * - `multi`: every card reads four records;
 * - `field`: every row reads one shared list and shows its own entry;
 * - `stream`: every row reads its own record, and each write changes many;
 * - `none`: rows read no data.
 *
 * `writes` is how many separately flushed writes the `write` step makes, each
 * changing `perWrite` records.
 */
export const SCENARIOS = {
	rows: { rows: 5000, reads: 1, writes: 100, perWrite: 1, lanes: ALL },
	multi: { rows: 1250, reads: 4, writes: 100, perWrite: 1, lanes: ALL },
	field: { rows: 5000, reads: 0, writes: 20, perWrite: 1, lanes: [...ALL, 'hooks-list'] },
	stream: { rows: 1000, reads: 1, writes: 20, perWrite: 100, lanes: ALL },
	none: { rows: 5000, reads: 0, writes: 0, perWrite: 0, lanes: ['hooks', 'hooks-on'] },
	/**
	 * An application shell that reads its data near the top of the tree: the
	 * viewer, settings, an unread count and 200 conversations, over a
	 * 100-message thread every row of which shows the `compact` setting.
	 * `hooks-top` reads everything in the shell and passes it down. Each write
	 * step makes `writes` separately flushed changes of one kind.
	 */
	shell: {
		rows: 200,
		reads: 0,
		writes: 200,
		perWrite: 1,
		lanes: ['hooks-top', 'hooks', 'cells', 'bound'],
		steps: ['mount', 'badge', 'rename', 'title', 'setting', 'unmount'],
	},
};
export const STEPS = ['mount', 'rerender', 'write', 'unmount'];
