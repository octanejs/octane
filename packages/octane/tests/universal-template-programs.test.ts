import { describe, expect, it } from 'vitest';
import {
	type UniversalHostCommand,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	universalFor,
	universalHostTemplates,
	universalPlan,
	universalValue,
} from '../src/universal.js';

// A driver that accepts prepared template programs and runs, and expands them
// into ordinary commands for the object host.
function createProgramDriver(structuredValues = false) {
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
			templateProgramStructuredValues: structuredValues,
		},
		prepareBatch(...args: Parameters<typeof base.prepareBatch>) {
			const [container, batch, context] = args;
			const commands: UniversalHostCommand[] = [];
			for (const command of batch.commands) {
				if (command.op === 'mount-template') {
					const ids = command.nodes.map((node) => node.id);
					command.nodes.forEach((node, index) => {
						commands.push({
							op: 'create',
							id: node.id,
							type: command.shape[index].type,
							props: node.props,
						});
						for (const event of node.events ?? []) {
							commands.push({
								op: 'event',
								id: node.id,
								type: event.type,
								listener: event.listener,
							});
						}
					});
					for (let index = 1; index < ids.length; index++) {
						commands.push({
							op: 'insert',
							parent: ids[command.shape[index].parent],
							id: ids[index],
							before: null,
						});
					}
					commands.push({
						op: 'insert',
						parent: command.parent,
						id: ids[0],
						before: command.before,
					});
					continue;
				}
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

// <row onClick={select}><label>{text}</label></row>: an event on the program's root node.
const rowPlan = universalPlan('object', {
	kind: 'host',
	type: 'row',
	bindings: [
		['tone', 0],
		['onClick', 1],
	],
	children: [{ kind: 'host', type: 'label', children: [{ kind: 'slot', slot: 2 }] }],
});
const shellPlan = universalPlan('object', {
	kind: 'host',
	type: 'shell',
	children: [{ kind: 'slot', slot: 0 }],
});

interface Item {
	readonly id: string;
	readonly text: string;
	readonly tone: string;
}

function listScene(clicks: string[], memo: boolean) {
	return defineUniversalComponent('object', ({ items }: { items: readonly Item[] }) =>
		universalValue(shellPlan, [
			universalFor(
				items,
				(item) => item.id,
				(item) =>
					universalValue(rowPlan, [
						item.tone,
						() => clicks.push(`${item.id}:${item.text}`),
						item.text,
					]),
				null,
				false,
				false,
				undefined,
				undefined,
				undefined,
				false,
				undefined,
				memo ? [clicks] : undefined,
				false,
			),
		]),
	);
}

function commandsOf(container: ReturnType<typeof createObjectContainer>, from = 0) {
	return container.commits.slice(from).flatMap((commit) => commit.commands);
}

describe('universal template programs', () => {
	it('mounts rows with an event on the program root as one run', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createProgramDriver());
		const clicks: string[] = [];
		const Scene = listScene(clicks, false);
		const items = ['a', 'b', 'c'].map((id) => ({ id, text: `label:${id}`, tone: 'plain' }));
		const prepared = root.prepare(Scene, { items });
		if (prepared.status !== 'prepared') throw new Error('Expected a mount batch.');
		const runs = prepared.batch.commands.filter((command) => command.op === 'mount-template-run');
		expect(runs).toHaveLength(1);
		const run = runs[0];
		if (run.op !== 'mount-template-run') throw new Error('Expected a run.');
		expect(run.count).toBe(3);
		expect(run.program.events).toEqual([{ node: 0, type: 'click', priority: 'discrete' }]);
		expect(prepared.batch.commands.some((command) => command.op === 'mount-template')).toBe(false);
		prepared.commit();
		const rows = container.children[0].children;
		container.dispatchEvent(rows[1], 'click', undefined);
		expect(clicks).toEqual(['b:label:b']);
		root.unmount();
	});

	it('keeps a root listener id while its handler changes, and across expansion', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createProgramDriver());
		const clicks: string[] = [];
		const Scene = listScene(clicks, false);
		const items = (text: string) => [{ id: 'a', text, tone: 'plain' }];
		root.render(Scene, { items: items('one') });
		const row = container.children[0].children[0];
		const mounted = commandsOf(container).length;
		root.render(Scene, { items: items('two') });
		// The label text changes; the new handler needs no host command.
		expect(commandsOf(container, 1).map((command) => command.op)).toEqual(['update']);
		expect(commandsOf(container).length).toBe(mounted + 1);
		container.dispatchEvent(row, 'click', undefined);
		expect(clicks).toEqual(['a:two']);
		// A row whose new values cannot stay in program form expands, and its root
		// keeps answering clicks under the same host.
		root.render(Scene, { items: [{ id: 'a', text: 'three', tone: { bold: true } as never }] });
		expect(container.children[0].children[0]).toBe(row);
		container.dispatchEvent(row, 'click', undefined);
		expect(clicks).toEqual(['a:two', 'a:three']);
		root.render(Scene, { items: items('four') });
		container.dispatchEvent(container.children[0].children[0], 'click', undefined);
		expect(clicks).toEqual(['a:two', 'a:three', 'a:four']);
		root.unmount();
	});

	it('patches the changed bindings of retained pure rows', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createProgramDriver());
		const clicks: string[] = [];
		const Scene = listScene(clicks, true);
		const items = ['a', 'b', 'c'].map((id) => ({ id, text: `label:${id}`, tone: 'plain' }));
		root.render(Scene, { items });
		const shell = container.children[0];
		const rows = [...shell.children];
		const labels = rows.map((row) => row.children[0]);

		// Same items: every row is retained and nothing is sent.
		const before = container.commits.length;
		root.render(Scene, { items: [...items] });
		expect(commandsOf(container, before)).toEqual([]);

		// New items: only the changed bindings are written, on the same hosts.
		const next = [{ ...items[0], text: 'label:A' }, items[1], { ...items[2], tone: 'loud' }];
		const changed = container.commits.length;
		root.render(Scene, { items: next });
		const commands = commandsOf(container, changed);
		expect(commands.every((command) => command.op === 'update')).toBe(true);
		expect(commands).toHaveLength(2);
		expect(shell.children).toEqual(rows);
		expect(shell.children.map((row) => row.children[0])).toEqual(labels);
		expect(labels.map((label) => label.children[0].props.value)).toEqual([
			'label:A',
			'label:b',
			'label:c',
		]);
		expect(rows.map((row) => row.props.tone)).toEqual(['plain', 'plain', 'loud']);

		// The swapped handlers answer under the committed listener ids.
		container.dispatchEvent(rows[0], 'click', undefined);
		container.dispatchEvent(rows[2], 'click', undefined);
		expect(clicks).toEqual(['a:label:A', 'c:label:c']);

		// The patched inputs are the committed ones: rendering them again is free.
		const again = container.commits.length;
		root.render(Scene, { items: next });
		expect(commandsOf(container, again)).toEqual([]);

		// Reordering patched rows moves them.
		root.render(Scene, { items: [next[2], next[0], next[1]] });
		expect(shell.children).toEqual([rows[2], rows[0], rows[1]]);
		root.unmount();
	});

	it('carries structured values in programs when the driver accepts them', () => {
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			bindings: [['style', 0]],
			children: [{ kind: 'host', type: 'label', children: [{ kind: 'slot', slot: 1 }] }],
		});
		const Scene = defineUniversalComponent(
			'object',
			({ rows }: { rows: readonly { id: string; width: number }[] }) =>
				universalValue(shellPlan, [
					universalFor(
						rows,
						(row) => row.id,
						(row) => universalValue(plan, [{ width: row.width, color: 'red' }, row.id]),
					),
				]),
		);
		const rows = [
			{ id: 'a', width: 1 },
			{ id: 'b', width: 2 },
		];
		for (const structured of [false, true]) {
			const container = createObjectContainer();
			const root = createUniversalRoot(container, createProgramDriver(structured));
			const prepared = root.prepare(Scene, { rows });
			if (prepared.status !== 'prepared') throw new Error('Expected a mount batch.');
			const ops = prepared.batch.commands.map((command) => command.op);
			expect(ops.includes('mount-template-run')).toBe(structured);
			prepared.commit();
			const shell = container.children[0];
			expect(shell.children.map((row) => row.props.style)).toEqual([
				{ width: 1, color: 'red' },
				{ width: 2, color: 'red' },
			]);
			// Equal content is not a change; new content is one update.
			const same = container.commits.length;
			root.render(Scene, { rows: rows.map((row) => ({ ...row })) });
			expect(commandsOf(container, same)).toEqual([]);
			const changed = container.commits.length;
			root.render(Scene, { rows: [rows[0], { id: 'b', width: 3 }] });
			const commands = commandsOf(container, changed);
			expect(commands).toEqual([
				{ op: 'update', id: shell.children[1].id, props: { style: { width: 3, color: 'red' } } },
			]);
			expect(shell.children[1].props.style).toEqual({ width: 3, color: 'red' });
			root.unmount();
		}
	});
});
