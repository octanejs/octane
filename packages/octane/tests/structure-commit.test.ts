import { describe, expect, it } from 'vitest';
import { createRoot, startTransition } from '../src/index.js';
import { act, mount, type MountResult } from './_helpers';
import {
	BranchProbeApp,
	ListProbeApp,
	StructureApp,
	type ListProps,
	type StructureProps,
} from './_fixtures/structure-commit.tsrx';

// Render computes, commit writes (#2043): content a render removes stays
// connected and untouched until its commit, which runs the deletion cleanups
// against connected DOM before the nodes leave. A render that never commits
// leaves the outgoing content exactly as it was.

type Priority = 'urgent' | 'transition';

const REMOVED = ['arm', 'keyed-1', 'row-a', 'row-b', 'child', 'held-arm'];

function setup() {
	const log: string[] = [];
	const onCleanup = (id: string, connected: boolean) => log.push(`${id}:${connected}`);
	const initial: StructureProps = {
		show: true,
		version: 1,
		rows: ['a', 'b'],
		child: true,
		onCleanup,
	};
	const app = mount(StructureApp, initial);
	const nodes = REMOVED.map((id) => app.find('#' + id));
	const render = (props: Partial<StructureProps>, priority: Priority) =>
		act(() => {
			const next = () => app.root.render(StructureApp, { ...initial, ...props });
			if (priority === 'transition') startTransition(next);
			else next();
		});
	return { app, log, nodes, render };
}

const REMOVE_ALL = { show: false, version: 2, rows: [], child: false };

function text(app: MountResult): string {
	return (
		app
			.findAll('b, i, p, u')
			.map((node) => node.textContent)
			.join(',') +
		'|' +
		app.find('main').textContent
	);
}

describe('structural deletions commit with their render', () => {
	for (const priority of ['urgent', 'transition'] as const) {
		it(`runs every deletion's cleanups against connected DOM, then removes it (${priority})`, async () => {
			const { app, log, nodes, render } = setup();
			try {
				await render(REMOVE_ALL, priority);
				expect([...log].sort()).toEqual(REMOVED.map((id) => `${id}:true`).sort());
				for (const node of nodes) expect(node.isConnected).toBe(false);
				expect(app.findAll('b').map((node) => node.id)).toEqual(['keyed-2']);
				expect(app.findAll('i').map((node) => node.textContent)).toEqual(['else', 'held else']);
			} finally {
				app.unmount();
			}
		});

		it(`a dropped ${priority} render leaves the outgoing content connected and untouched`, async () => {
			const { app, log, nodes, render } = setup();
			const before = text(app);
			const removed: Node[] = [];
			const collect = (records: MutationRecord[]) => {
				for (const record of records) removed.push(...record.removedNodes);
			};
			const observer = new MutationObserver(collect);
			observer.observe(app.container, { childList: true, subtree: true });
			try {
				// A sibling outside every boundary suspends: the root keeps its screen.
				await render({ ...REMOVE_ALL, gate: new Promise(() => {}) }, priority);
				collect(observer.takeRecords());
				expect(removed.filter((node) => nodes.some((old) => node.contains(old)))).toEqual([]);
				for (const node of nodes) expect(node.isConnected).toBe(true);
				expect(log).toEqual([]);
				expect(text(app)).toBe(before);

				// The next render that completes commits the same deletions.
				await render(REMOVE_ALL, priority);
				expect([...log].sort()).toEqual(REMOVED.map((id) => `${id}:true`).sort());
				for (const node of nodes) expect(node.isConnected).toBe(false);
			} finally {
				observer.disconnect();
				app.unmount();
			}
		});

		it(`builds replaced branches and components off-document and inserts them at commit (${priority})`, async () => {
			let observing = false;
			let during: MutationRecord[] | null = null;
			const observer = new MutationObserver(() => {});
			const probe = () => {
				if (observing) during = observer.takeRecords();
			};
			const app = mount(BranchProbeApp, { show: true, probe });
			const shown = app.find('#shown');
			observer.observe(app.container, {
				childList: true,
				subtree: true,
				attributes: true,
				characterData: true,
			});
			try {
				for (const show of [false, true]) {
					observing = true;
					await act(() => {
						const next = () => app.root.render(BranchProbeApp, { show, probe: () => probe() });
						if (priority === 'transition') startTransition(next);
						else next();
					});
					observing = false;
					// Nothing reached the committed DOM while the render was running.
					expect(during).toEqual([]);
					expect(app.findAll('b, i, s, q, em, small').map((node) => node.textContent)).toEqual(
						show
							? ['shown', 'keyed', 'shown value']
							: ['hidden', 'second root', 'keyed', 'hidden value', 'second value root'],
					);
				}
				expect(shown.isConnected).toBe(false);
			} finally {
				observer.disconnect();
				app.unmount();
			}
		});
	}

	it('mounts a root off-document and inserts it in one commit', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const records: MutationRecord[] = [];
		let during: MutationRecord[] | null = null;
		const observer = new MutationObserver((batch) => records.push(...batch));
		observer.observe(container, { childList: true, subtree: true, characterData: true });
		const root = createRoot(container);
		try {
			root.render(BranchProbeApp, {
				show: false,
				probe: () => {
					during = observer.takeRecords();
				},
			});
			records.push(...observer.takeRecords());
			// The render touched nothing; its commit added the tree with one insert.
			expect(during).toEqual([]);
			expect(records).toHaveLength(1);
			expect(records[0].target).toBe(container);
			expect(container.querySelector('#hidden')?.textContent).toBe('hidden');
		} finally {
			observer.disconnect();
			root.unmount();
			container.remove();
		}
	});
});

describe('keyed lists change their structure at commit', () => {
	function setupList(rows: string[]) {
		const log: string[] = [];
		let observing = false;
		let during: MutationRecord[] | null = null;
		// Every record the lists produce, delivered or still queued.
		const records: MutationRecord[] = [];
		const observer = new MutationObserver((batch) => records.push(...batch));
		const mutations = () => {
			records.push(...observer.takeRecords());
			return records.splice(0);
		};
		const initial: ListProps = {
			rows,
			probe: () => {
				if (observing) during = mutations();
			},
			onCleanup: (id, connected) => log.push(`${id}:${connected}`),
		};
		const app = mount(ListProbeApp, initial);
		observer.observe(app.find('main'), {
			childList: true,
			subtree: true,
			attributes: true,
			characterData: true,
		});
		const render = async (props: Partial<ListProps>, priority: Priority) => {
			mutations();
			observing = true;
			during = null;
			try {
				await act(() => {
					const next = () => app.root.render(ListProbeApp, { ...initial, ...props });
					if (priority === 'transition') startTransition(next);
					else next();
				});
			} finally {
				observing = false;
			}
			return during;
		};
		return { app, log, observer, mutations, render };
	}

	const lists = (app: MountResult) => app.findAll('ul, ol').map((list) => [...list.childNodes]);
	const sameNodes = (a: Node[][], b: Node[][]) =>
		a.length === b.length &&
		a.every((nodes, i) => nodes.length === b[i].length && nodes.every((n, j) => n === b[i][j]));
	const labels = (app: MountResult) => [
		app.findAll('#paired li').map((node) => node.id),
		app.findAll('.plain').map((node) => node.textContent),
	];

	for (const priority of ['urgent', 'transition'] as const) {
		it(`a dropped ${priority} render leaves the old rows connected, in order, and untouched`, async () => {
			const { app, log, observer, mutations, render } = setupList(['a', 'b', 'c', 'd']);
			const before = lists(app);
			const survivors = ['#row-a', '#row-b', '#row-d'].map((id) => app.find(id));
			const plain = () => app.findAll('.plain').filter((node) => node.textContent !== 'x');
			const plainSurvivors = plain().filter((node) => node.textContent !== 'c');
			try {
				// Removes c, inserts x and moves d first while a sibling suspends.
				await render({ rows: ['d', 'x', 'b', 'a'], gate: new Promise(() => {}) }, priority);
				expect(mutations()).toEqual([]);
				expect(sameNodes(lists(app), before)).toBe(true);
				expect(log).toEqual([]);

				// The render that completes lands the same change, keeping survivors.
				await render({ rows: ['d', 'x', 'b', 'a'] }, priority);
				expect(labels(app)).toEqual([
					['row-d', 'row-x', 'row-b', 'row-a'],
					['d', 'x', 'b', 'a'],
				]);
				['#row-a', '#row-b', '#row-d'].forEach((id, i) => expect(app.find(id)).toBe(survivors[i]));
				// d, b, a: the same nodes in their new order.
				const moved = plain();
				[2, 1, 0].forEach((old, i) => expect(moved[i]).toBe(plainSurvivors[old]));
				expect(log).toEqual(['row-c:true']);
			} finally {
				observer.disconnect();
				app.unmount();
			}
		});

		it(`builds rows off-document and lands them at commit (${priority})`, async () => {
			const { app, observer, render } = setupList(['a', 'b']);
			try {
				for (const rows of [['b', 'c', 'a'], [], ['z'], ['y', 'z'], ['z', 'w', 'y']]) {
					// Nothing reached the committed DOM while the lists reconciled.
					expect(await render({ rows }, priority)).toEqual([]);
					expect(labels(app)).toEqual([
						rows.length === 0 ? ['empty'] : rows.map((row) => 'row-' + row),
						rows,
					]);
					expect(app.find('#plain').firstElementChild!.textContent).toBe('first');
					expect(app.find('#plain').lastElementChild!.textContent).toBe('last');
				}
			} finally {
				observer.disconnect();
				app.unmount();
			}
		});
	}
});
