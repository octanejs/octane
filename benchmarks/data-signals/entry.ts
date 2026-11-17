/**
 * One lane and scenario per page: `?lane=hooks&scenario=rows`. Each step runs
 * synchronously in one call, so the runner times it with `performance.now()`
 * around the call and checks the DOM in the same task.
 */
import { createRoot, flushSync } from 'octane';
import { receive, type Read } from 'octane/data';
import { App } from './app.tsrx';
import { SCENARIOS, WRITTEN } from './contract.mjs';
import { dataStore, idsOf, initial, item, items, type Item } from './data.ts';
import { counts, type Body, type Row, type Slot } from './shared.ts';
import {
	conversations,
	notifications,
	RENAMED,
	settings,
	shellStore,
	shellValues,
	viewer,
	type ShellValues,
} from './shell-data.ts';

const query = new URLSearchParams(location.search);
const lane = query.get('lane')!;
const scenario = query.get('scenario') as keyof typeof SCENARIOS;
const config = SCENARIOS[scenario];
if (!config?.lanes.includes(lane)) throw new Error(`unknown case ${location.search}`);
const container = document.getElementById('app')!;

const signalLane = lane === 'cells' || lane === 'bound';
const shell = scenario === 'shell';
let Row: Row | undefined;
let Body: Body | undefined;
if (shell) {
	const app = signalLane
		? await import('./shell-signals.tsrx')
		: await import('./shell-hooks.tsrx');
	const shells: Record<string, unknown> = {
		'hooks-top': (app as any).ShellTop,
		hooks: (app as any).ShellHooks,
		cells: (app as any).ShellCells,
		bound: (app as any).ShellBound,
	};
	Body = shells[lane] as Body;
} else if (signalLane) {
	const app = await import('./signals-app.tsrx');
	Row = app[lane as 'cells' | 'bound'][scenario as 'rows'];
} else {
	const app = await import('./hooks-app.tsrx');
	if (lane === 'hooks-list') Body = app.FieldList;
	else Row = app.rows[scenario];
	// An application that uses signals anywhere has loaded a module like this one.
	if (lane === 'hooks-on') await import('./signals-app.tsrx');
}
const mirror = signalLane ? (await import('./cells.ts')).mirror : null;

const reads = Math.max(1, config.reads);
const list = scenario === 'field';
const ids = idsOf(config.rows * reads);
const slots: Slot[] = Array.from({ length: config.rows }, (_, index) => ({
	id: ids[index * reads]!,
	index,
	ids: ids.slice(index * reads, index * reads + reads),
}));

function open() {
	const values = shellValues();
	const data = shell ? shellStore(values) : dataStore(scenario === 'none' ? [] : ids, list);
	return { ...data, rows: initial(ids), values, close: mirror?.(data.handles) };
}
let data = open();
let root: ReturnType<typeof createRoot> | null = null;
let tick = 0;
let label = 0;
const props = () => ({ store: data.store, slots, tick, Row, Body });
const render = () => flushSync(() => root!.render(App, props() as never));

/** The slots one write changes: one, or `perWrite` spread evenly and shifted each write. */
function targets(write: number): number[] {
	if (config.perWrite === 1) return [WRITTEN];
	const stride = config.rows / config.perWrite;
	return Array.from({ length: config.perWrite }, (_, at) => (at * stride + write) % config.rows);
}

/** A step's check: the slot whose text it must show, or a test of the DOM. */
type Check = [number, string] | (() => boolean) | undefined;

/** `shell` writes: each one `writes` separately flushed changes to one read, then a check. */
function shellWrites<T>(
	definition: Read<void, T>,
	next: (current: T, write: number) => T,
	shown: (value: T) => boolean,
): () => Check {
	return () => {
		let value = data.values[definition.name as keyof ShellValues] as T;
		for (let write = 0; write < config.writes; write++) {
			value = next(value, write);
			flushSync(() => receive(data.store, [{ read: definition, value }]));
		}
		(data.values as any)[definition.name] = value;
		const last = value;
		return () => shown(last);
	};
}
const text = (selector: string) => container.querySelector(selector)?.textContent;

const shellSteps = {
	badge: shellWrites(
		notifications,
		(current) => ({ unread: current.unread + 1 }),
		(value) => text('#badge') === String(value.unread),
	),
	rename: shellWrites(
		viewer,
		(_, write) => ({ name: `viewer ${++label}-${write}` }),
		(value) => text('#viewer') === value.name,
	),
	title: shellWrites(
		conversations,
		(current) => {
			const list = current.slice();
			list[RENAMED] = { ...list[RENAMED]!, title: `title ${++label}` };
			return list;
		},
		(value) => container.querySelectorAll('li')[RENAMED]?.textContent === value[RENAMED]!.title,
	),
	setting: shellWrites(
		settings,
		(current) => ({ compact: !current.compact }),
		(value) =>
			Array.from(container.querySelectorAll('#thread p')).every(
				(line) => line.className === (value.compact ? 'msg compact' : 'msg'),
			),
	),
};

const steps: Record<string, () => Check> = {
	mount() {
		root = createRoot(container);
		render();
	},
	rerender() {
		tick++;
		render();
	},
	write() {
		let check: [number, string] | undefined;
		for (let write = 0; write < config.writes; write++) {
			const next = `edit ${++label}`;
			const changed = targets(write);
			const values = changed.map((slot): Item => ({ id: slots[slot]!.id, label: next }));
			flushSync(() => {
				if (list) {
					const rows = data.rows.slice();
					for (const [at, slot] of changed.entries()) rows[slot] = values[at]!;
					data.rows = rows;
					receive(data.store, [{ read: items, value: rows }]);
				} else {
					receive(
						data.store,
						values.map((value) => ({ read: item, input: { id: value.id }, value })),
					);
				}
			});
			check = [changed[0]!, next];
		}
		return check;
	},
	unmount() {
		root!.unmount();
		root = null;
	},
	...shellSteps,
};

(window as any).__bench = {
	run(step: string) {
		const before = counts.renders;
		const started = performance.now();
		const check = steps[step]();
		const duration = performance.now() - started;
		const shown = container.querySelectorAll('li');
		return {
			duration,
			renders: counts.renders - before,
			rows: shown.length,
			written:
				!check ||
				(typeof check === 'function'
					? check()
					: shown[check[0]]?.firstChild?.textContent === check[1]),
		};
	},
	heap: () => (performance as any).memory.usedJSHeapSize as number,
	/** Start from a fresh store, outside the timed steps. */
	async reset() {
		data.close?.();
		await data.store.retire();
		data = open();
	},
};
(window as any).__ready = true;
