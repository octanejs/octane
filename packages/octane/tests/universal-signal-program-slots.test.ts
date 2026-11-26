import { afterEach, describe, expect, it } from 'vitest';
import {
	type UniversalHostBatch,
	type UniversalHostCommand,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	universalHostTemplates,
} from '../src/universal.js';
import {
	ProgramRows,
	ProgramScoped,
	cells,
	rowPicks,
	tone$,
} from './_fixtures/universal-signal-bindings.object.tsrx';

// Signal handles in template-program slots: bound rows still mount as one
// program run, and a write updates the bound program node by its id.

// A driver that accepts prepared programs and runs and expands them into
// ordinary object-host commands. `batches` records the batches as the root
// sent them, before expansion.
function createProgramDriver(batches: UniversalHostBatch[]) {
	const base = createObjectDriver();
	return {
		...base,
		templates: universalHostTemplates,
		capabilities: {
			...base.capabilities,
			templateMount: true,
			collapsedTemplateMount: true,
			templateProgramMount: true,
			stableStaticHostProps: true,
			templateProgramRuns: true,
		},
		prepareBatch(...args: Parameters<typeof base.prepareBatch>) {
			const [container, batch, context] = args;
			batches.push(batch);
			const commands: UniversalHostCommand[] = [];
			for (const command of batch.commands) {
				if (command.op !== 'mount-template-run' && command.op !== 'mount-template-range') {
					commands.push(command);
					continue;
				}
				const count = command.op === 'mount-template-run' ? command.count : 1;
				const nodes = command.program.nodes;
				const stride = command.values.length / count;
				for (let row = 0; row < count; row++) {
					const firstId = command.firstId + row * nodes.length;
					for (let index = 0; index < nodes.length; index++) {
						const props: Record<string, unknown> = { ...nodes[index].props };
						for (const binding of nodes[index].bindings ?? []) {
							props[binding.name] = command.values[row * stride + binding.valueIndex];
						}
						commands.push({ op: 'create', id: firstId + index, type: nodes[index].type, props });
					}
					command.program.events.forEach((event, eventIndex) => {
						commands.push({
							op: 'event',
							id: firstId + event.node,
							type: event.type,
							listener: {
								id: command.firstListenerId! + row * command.program.events.length + eventIndex,
								priority: event.priority,
							},
						});
					});
					for (let index = 1; index < nodes.length; index++) {
						commands.push({
							op: 'insert',
							parent: firstId + nodes[index].parent,
							id: firstId + index,
							before: null,
						});
					}
					commands.push({
						op: 'insert',
						parent: command.parent,
						id: firstId,
						before: command.before,
					});
				}
			}
			return base.prepareBatch(container, { ...batch, commands }, context);
		},
	};
}

function mountPrograms(component: unknown) {
	const container = createObjectContainer();
	const batches: UniversalHostBatch[] = [];
	const driver = createProgramDriver(batches);
	const root = createUniversalRoot(container, driver);
	root.render(component as never, undefined);
	return { container, root, driver, batches };
}

type MountRun = Extract<UniversalHostCommand, { op: 'mount-template-run' }>;

function mountRun(batch: UniversalHostBatch): MountRun {
	return batch.commands.find((command) => command.op === 'mount-template-run') as MountRun;
}

// Hosts created one by one: only the list's own view, never a row node.
function createdTypes(batch: UniversalHostBatch): string[] {
	return batch.commands.flatMap((command) => (command.op === 'create' ? [command.type] : []));
}

const microtask = () => new Promise<void>((resolve) => queueMicrotask(resolve));

function rows(container: ReturnType<typeof createObjectContainer>) {
	return container.children[0].children.map((row) => ({
		value: row.props.value,
		text: row.children.map((label) => label.children[0]?.props.value).join(''),
	}));
}

let unmount: (() => void) | null = null;

afterEach(() => {
	unmount?.();
	unmount = null;
	rowPicks.set = null;
	tone$.set('calm');
	cells.forEach((cell, index) => cell.set(index));
});

describe('universal signal bindings in template programs', () => {
	it('mounts bound rows as one program run carrying the current values', () => {
		cells[1].set(11);
		const { container, root, batches } = mountPrograms(ProgramRows);
		unmount = () => root.unmount();
		const ops = batches[0].commands.map((command) => command.op);
		expect(ops.filter((op) => op === 'mount-template-run')).toHaveLength(1);
		expect(createdTypes(batches[0])).toEqual(['view']);
		expect(mountRun(batches[0]).count).toBe(4);
		expect(rows(container)).toEqual([
			{ value: 0, text: '#0' },
			{ value: 11, text: '#11' },
			{ value: 2, text: '#2' },
			{ value: 3, text: '#3' },
		]);
	});

	it('updates the bound program nodes of one row by id on a write', async () => {
		const { container, root, batches } = mountPrograms(ProgramRows);
		unmount = () => root.unmount();
		const run = mountRun(batches[0]);
		const stride = run.program.nodes.length;
		const mounted = batches.length;
		cells[2].set(20);
		await microtask();
		expect(batches.length).toBe(mounted + 1);
		const commands = batches.at(-1)!.commands as Extract<UniversalHostCommand, { op: 'update' }>[];
		// Row 2's root prop and its second label's text node, in node order.
		expect(commands.map((command) => command.op)).toEqual(['update', 'update']);
		const nodes = commands.map((command) => command.id - run.firstId - 2 * stride);
		expect(nodes[0]).toBe(0);
		expect(run.program.nodes[nodes[1]].type).toBe('#text');
		expect(commands[0].props).toMatchObject({ value: 20 });
		expect(commands[1].props).toEqual({ value: '20' });
		expect(rows(container)[2]).toEqual({ value: 20, text: '#20' });
		// Writes to two rows in one task: one batch with the last values.
		cells[0].set(7);
		cells[0].set(8);
		cells[3].set(30);
		await microtask();
		expect(batches.length).toBe(mounted + 2);
		expect(batches.at(-1)!.commands).toHaveLength(4);
		expect(rows(container).map((row) => row.text)).toEqual(['#8', '#1', '#20', '#30']);
	});

	it('keeps a row handler working beside its bound slots', async () => {
		const { container, root } = mountPrograms(ProgramRows);
		unmount = () => root.unmount();
		container.dispatchEvent(container.children[0].children[1], 'press', undefined);
		await microtask();
		expect(rows(container)[1]).toEqual({ value: 101, text: '#101' });
	});

	it('rebinds a retained row whose slot takes another handle', async () => {
		const { container, root, batches } = mountPrograms(ProgramRows);
		unmount = () => root.unmount();
		rowPicks.set!(1);
		await microtask();
		expect(rows(container).map((row) => row.text)).toEqual(['#1', '#0', '#2', '#3']);
		const afterSwap = batches.length;
		// Row 0 now shows cells[1], and row 1 shows cells[0].
		cells[1].set(41);
		await microtask();
		expect(rows(container).map((row) => row.text)).toEqual(['#41', '#0', '#2', '#3']);
		cells[0].set(40);
		await microtask();
		expect(rows(container).map((row) => row.text)).toEqual(['#41', '#40', '#2', '#3']);
		expect(batches.length).toBe(afterSwap + 2);
		expect(batches.at(-1)!.commands.every((command) => command.op === 'update')).toBe(true);
	});

	it('stops updating program slots after unmount', async () => {
		const { root, batches } = mountPrograms(ProgramRows);
		root.unmount();
		const after = batches.length;
		cells[2].set(5);
		await microtask();
		expect(batches.length).toBe(after);
	});

	it('binds one handle in every row through a scoped class', async () => {
		const { container, root, batches } = mountPrograms(ProgramScoped);
		unmount = () => root.unmount();
		expect(createdTypes(batches[0])).toEqual(['view']);
		expect(mountRun(batches[0]).count).toBe(4);
		expect(container.children[0].children.map((row) => row.props.class)).toEqual(
			new Array(4).fill('calm scope-b'),
		);
		const mounted = batches.length;
		tone$.set('loud');
		await microtask();
		expect(batches.length).toBe(mounted + 1);
		expect(batches.at(-1)!.commands).toHaveLength(4);
		expect(container.children[0].children.map((row) => row.props.class)).toEqual(
			new Array(4).fill('loud scope-b'),
		);
	});
});
