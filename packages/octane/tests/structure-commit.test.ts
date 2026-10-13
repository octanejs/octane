import { describe, expect, it } from 'vitest';
import { startTransition } from '../src/index.js';
import { act, mount, type MountResult } from './_helpers';
import {
	BranchProbeApp,
	StructureApp,
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
});
