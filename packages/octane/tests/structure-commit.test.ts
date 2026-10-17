import { describe, expect, it } from 'vitest';
import { createElement, createRoot, flushSync, startTransition, use } from '../src/index.js';
import { act, mount, type MountResult } from './_helpers';
import {
	RetireList,
	ActivityApp,
	ArmSwapApp,
	type ArmSwapControls,
	BoundaryArmsApp,
	BranchProbeApp,
	LateBoundaryApp,
	ListProbeApp,
	MappedApp,
	OutsideApp,
	ResumeApp,
	SelectProbeApp,
	StructureApp,
	type ActivityProps,
	type BoundaryArmsProps,
	type ListProps,
	type MappedProps,
	type MappedRow,
	type OutsideProps,
	type SelectProps,
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

	it("clears a root container's previous content at commit", () => {
		const container = document.createElement('div');
		container.innerHTML = '<p id="old">old</p>';
		document.body.appendChild(container);
		const old = container.firstChild;
		let during: Node | null = null;
		const root = createRoot(container);
		try {
			root.render(BranchProbeApp, {
				show: false,
				probe: () => {
					during = container.firstChild;
				},
			});
			// The render left the previous content in place; the commit replaced it.
			expect(during).toBe(old);
			expect(old!.parentNode).toBe(null);
			expect(container.querySelector('#hidden')?.textContent).toBe('hidden');
		} finally {
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

// Descriptor children of a pure host reconcile through the de-opt list.
interface DeoptProps {
	rows: string[];
	label: string;
	tag: 'b' | 'i';
	gate?: PromiseLike<unknown>;
	probe: () => void;
}

function DeoptProbe(props: { probe: () => void }) {
	props.probe();
	return createElement('u', null, 'probe');
}

function DeoptGate(props: { gate: PromiseLike<unknown> }) {
	use(props.gate);
	return null;
}

function DeoptLeaf(props: { label: string }) {
	return createElement('em', { title: props.label }, props.label);
}

function DeoptListApp(props: DeoptProps) {
	return createElement(
		'section',
		null,
		createElement(
			'ul',
			{ id: 'deopt', title: props.label },
			props.rows.map((row) =>
				createElement('li', { key: row, id: 'deopt-' + row, className: props.label }, row),
			),
		),
		// A host with a component child renders through a Block of its own.
		createElement(
			'div',
			{ id: 'deopt-host', title: props.label },
			createElement(DeoptLeaf, { label: props.label }),
		),
		createElement('p', { id: 'deopt-text' }, props.label),
		// This item changes element.
		createElement(props.tag, { id: 'deopt-item' }, props.label),
		createElement(DeoptProbe, { probe: props.probe }),
		props.gate ? createElement(DeoptGate, { gate: props.gate }) : null,
	);
}

// Self-marked items (one element each) of a keyed de-opt list.
interface DeoptItemsProps {
	rows: string[];
	swap: string;
	gate?: PromiseLike<unknown>;
	probe: () => void;
}

function DeoptMark() {
	return null;
}

function DeoptItemsApp(props: DeoptItemsProps) {
	return createElement(
		'section',
		null,
		// A component child makes the host's children a list of item Blocks.
		createElement(
			'div',
			{ id: 'items' },
			props.rows.map((row) =>
				createElement(row === props.swap ? 'i' : 'b', { key: row, id: 'item-' + row }, row),
			),
			createElement(DeoptMark),
		),
		createElement(DeoptProbe, { probe: props.probe }),
		props.gate ? createElement(DeoptGate, { gate: props.gate }) : null,
	);
}

function observeMutations(target: Node) {
	const records: MutationRecord[] = [];
	const observer = new MutationObserver((batch) => records.push(...batch));
	observer.observe(target, {
		childList: true,
		subtree: true,
		characterData: true,
		attributes: true,
	});
	const mutations = () => {
		records.push(...observer.takeRecords());
		return records.splice(0);
	};
	return { observer, mutations };
}

describe('de-opt hosts change at commit', () => {
	for (const priority of ['urgent', 'transition'] as const) {
		it(`patches props, text and children and replaces elements at commit only (${priority})`, async () => {
			let during: MutationRecord[] | null = null;
			const initial: DeoptProps = {
				rows: ['a', 'b', 'c', 'd'],
				label: 'before',
				tag: 'b',
				probe: () => {},
			};
			const app = mount(DeoptListApp, initial);
			const section = app.find('section');
			const list = app.find('#deopt');
			const { observer, mutations } = observeMutations(section);
			const before = [...list.childNodes];
			const item = app.find('#deopt-item');
			const shown = () => [
				list.getAttribute('title'),
				[...list.children].map((node) => node.id + '.' + node.className).join(),
				app.find('#deopt-host').getAttribute('title'),
				app.find('em').getAttribute('title') + '/' + app.find('em').textContent,
				app.find('#deopt-text').textContent,
				app.find('#deopt-item').localName + '/' + app.find('#deopt-item').textContent,
			];
			const render = (props: Partial<DeoptProps>) => {
				// Only what this render writes before its probe counts.
				mutations();
				during = null;
				return act(() => {
					const next = () =>
						app.root.render(DeoptListApp, {
							...initial,
							probe: () => {
								during = mutations();
							},
							...props,
						});
					if (priority === 'transition') startTransition(next);
					else next();
				});
			};
			const change: Partial<DeoptProps> = { rows: ['d', 'x', 'b', 'a'], label: 'after', tag: 'i' };
			try {
				const old = shown();
				mutations();
				// A sibling suspends: the dropped render leaves the hosts as they were.
				await render({ ...change, gate: new Promise(() => {}) });
				expect(during).toEqual([]);
				expect(mutations()).toEqual([]);
				expect(shown()).toEqual(old);
				expect([...list.childNodes].every((node, i) => node === before[i])).toBe(true);
				expect(list.childNodes).toHaveLength(before.length);
				expect(app.find('#deopt-item')).toBe(item);

				await render(change);
				expect(during).toEqual([]);
				expect(shown()).toEqual([
					'after',
					'deopt-d.after,deopt-x.after,deopt-b.after,deopt-a.after',
					'after',
					'after/after',
					'after',
					'i/after',
				]);
				for (const id of ['a', 'b', 'd'])
					expect(app.find('#deopt-' + id)).toBe(
						before.find((node) => (node as Element).id === 'deopt-' + id),
					);
				expect(item.isConnected).toBe(false);
			} finally {
				observer.disconnect();
				app.unmount();
			}
		});

		it(`replaces a self-marked item while its keyed list moves it (${priority})`, async () => {
			let during: MutationRecord[] | null = null;
			const initial: DeoptItemsProps = { rows: ['a', 'b', 'c'], swap: '', probe: () => {} };
			const app = mount(DeoptItemsApp, initial);
			const section = app.find('#items');
			const { observer, mutations } = observeMutations(app.find('section'));
			const items = () =>
				[...section.children]
					.filter((node) => node.id.startsWith('item-'))
					.map((node) => node.localName + '#' + node.id);
			const b = app.find('#item-b');
			const render = (props: Partial<DeoptItemsProps>) => {
				// Only what this render writes before its probe counts.
				mutations();
				during = null;
				return act(() => {
					const next = () =>
						app.root.render(DeoptItemsApp, {
							...initial,
							probe: () => {
								during = mutations();
							},
							...props,
						});
					if (priority === 'transition') startTransition(next);
					else next();
				});
			};
			try {
				mutations();
				await render({ rows: ['c', 'a', 'b'], swap: 'a', gate: new Promise(() => {}) });
				expect(during).toEqual([]);
				expect(mutations()).toEqual([]);
				expect(items()).toEqual(['b#item-a', 'b#item-b', 'b#item-c']);

				// The replaced item lands where the list moved it, in one commit.
				await render({ rows: ['c', 'a', 'b'], swap: 'a' });
				expect(during).toEqual([]);
				expect(items()).toEqual(['b#item-c', 'i#item-a', 'b#item-b']);

				await render({ rows: ['b', 'c', 'a'], swap: 'c' });
				expect(during).toEqual([]);
				expect(items()).toEqual(['b#item-b', 'i#item-c', 'b#item-a']);
				expect(app.find('#item-b')).toBe(b);
				expect(section.querySelectorAll('[id^="item-"]')).toHaveLength(3);
			} finally {
				observer.disconnect();
				app.unmount();
			}
		});
	}
});

describe('content outside the container lands at commit', () => {
	for (const priority of ['urgent', 'transition'] as const) {
		it(`appends a new head element and portal, and delegates the portal's events, only when their render commits (${priority})`, async () => {
			const target = document.createElement('aside');
			document.body.appendChild(target);
			const label = `outside-${priority}`;
			const records: MutationRecord[] = [];
			const observer = new MutationObserver((batch) => records.push(...batch));
			const mutations = () => {
				records.push(...observer.takeRecords());
				return records.splice(0);
			};
			let during: MutationRecord[] | null = null;
			// The delegation's iOS tap shim marks a target that listens.
			let listening: boolean | null = null;
			const initial: OutsideProps = { show: false, label, target, probe: () => {} };
			const app = mount(OutsideApp, initial);
			observer.observe(document.head, { childList: true, subtree: true, characterData: true });
			observer.observe(target, { childList: true, subtree: true, characterData: true });
			const titles = () =>
				[...document.head.querySelectorAll('title')].filter((node) => node.textContent === label);
			const render = (props: Partial<OutsideProps>) =>
				act(() => {
					const next = () =>
						app.root.render(OutsideApp, {
							...initial,
							probe: () => {
								during = mutations();
								listening = target.onclick !== null;
							},
							...props,
						});
					if (priority === 'transition') startTransition(next);
					else next();
				});
			try {
				mutations();
				// A sibling suspends: nothing reaches <head> or the portal target.
				await render({ show: true, gate: new Promise(() => {}) });
				expect(during).toEqual([]);
				expect(mutations()).toEqual([]);
				expect(titles()).toHaveLength(0);
				expect(target.childNodes).toHaveLength(0);
				expect(target.onclick).toBe(null);

				await render({ show: true });
				expect(during).toEqual([]);
				expect(listening).toBe(false);
				expect(titles()).toHaveLength(1);
				expect(target.querySelector('.portal-out')?.textContent).toBe(label);
				expect(target.onclick).not.toBe(null);
			} finally {
				observer.disconnect();
				app.unmount();
				target.remove();
			}
			expect(titles()).toHaveLength(0);
		});

		it(`updates a committed head element only when its render commits (${priority})`, async () => {
			const target = document.createElement('aside');
			document.body.appendChild(target);
			let during: MutationRecord[] | null = null;
			const initial: OutsideProps = {
				show: true,
				label: `head-${priority}`,
				target,
				probe: () => {},
			};
			const app = mount(OutsideApp, initial);
			const title = [...document.head.querySelectorAll('title')].find(
				(node) => node.textContent === initial.label,
			)!;
			const { observer, mutations } = observeMutations(document.head);
			const render = (props: Partial<OutsideProps>) => {
				mutations();
				during = null;
				return act(() => {
					const next = () =>
						app.root.render(OutsideApp, {
							...initial,
							probe: () => {
								during = mutations();
							},
							...props,
						});
					if (priority === 'transition') startTransition(next);
					else next();
				});
			};
			try {
				await render({ label: 'next', gate: new Promise(() => {}) });
				expect(during).toEqual([]);
				expect(mutations()).toEqual([]);
				expect(title.textContent).toBe(initial.label);

				await render({ label: 'next' });
				expect(during).toEqual([]);
				expect(title.isConnected).toBe(true);
				expect(title.textContent).toBe('next');
			} finally {
				observer.disconnect();
				app.unmount();
				target.remove();
			}
		});
	}
});

describe('a controlled select changes its selection at commit', () => {
	for (const priority of ['urgent', 'transition'] as const) {
		it(`keeps the committed selection until the render commits (${priority})`, async () => {
			let during: string[] | null = null;
			const initial: SelectProps = { rows: ['a', 'b', 'c'], values: ['a'], probe: () => {} };
			const app = mount(SelectProbeApp, initial);
			const select = app.find('select') as HTMLSelectElement;
			const options = [...select.options];
			const selected = () => [...select.selectedOptions].map((option) => option.value);
			const render = (props: Partial<SelectProps>) => {
				during = null;
				return act(() => {
					const next = () =>
						app.root.render(SelectProbeApp, {
							...initial,
							probe: () => {
								during = selected();
							},
							...props,
						});
					if (priority === 'transition') startTransition(next);
					else next();
				});
			};
			try {
				await render({ values: ['b', 'c'], gate: new Promise(() => {}) });
				expect(during).toEqual(['a']);
				expect(selected()).toEqual(['a']);

				await render({ rows: ['d', 'b', 'c'], values: ['b', 'c'] });
				expect(during).toEqual(['a']);
				expect(selected()).toEqual(['b', 'c']);
				expect([...select.options].slice(1)).toEqual(options.slice(1));
			} finally {
				app.unmount();
			}
		});
	}
});

describe('Activity visibility changes at commit', () => {
	for (const priority of ['urgent', 'transition'] as const) {
		for (const [from, to] of [
			['hidden', 'visible'],
			['visible', 'hidden'],
		] as const) {
			it(`a dropped ${priority} render leaves a ${from} Activity ${from} (${to} requested)`, async () => {
				const log: string[] = [];
				const initial: ActivityProps = { mode: from, label: 'a', log: (entry) => log.push(entry) };
				const app = mount(ActivityApp, initial);
				const leaf = app.find('#activity-leaf') as HTMLElement;
				const records: MutationRecord[] = [];
				const observer = new MutationObserver((batch) => records.push(...batch));
				observer.observe(app.container, {
					childList: true,
					subtree: true,
					attributes: true,
					characterData: true,
				});
				const shown = () => leaf.style.display !== 'none';
				const render = (props: Partial<ActivityProps>) =>
					act(() => {
						const next = () => app.root.render(ActivityApp, { ...initial, ...props });
						if (priority === 'transition') startTransition(next);
						else next();
					});
				try {
					log.length = 0;
					await render({ mode: to, gate: new Promise(() => {}) });
					records.push(...observer.takeRecords());
					expect(records).toEqual([]);
					expect(shown()).toBe(from === 'visible');
					expect(log).toEqual([]);

					// The render that completes makes the same change.
					await render({ mode: to, label: 'b' });
					expect(shown()).toBe(to === 'visible');
					expect(log).toEqual([to === 'visible' ? 'mount' : 'unmount']);
					// And Activity keeps working afterwards.
					log.length = 0;
					await render({ mode: from, label: 'c' });
					expect(shown()).toBe(from === 'visible');
					expect(log).toEqual([from === 'visible' ? 'mount' : 'unmount']);
				} finally {
					observer.disconnect();
					app.unmount();
				}
			});
		}
	}
});

describe('a resumed boundary commits its reveal', () => {
	it('keeps the fallback and the hide until the resumed render commits', async () => {
		let resolve!: (value: string) => void;
		const value = new Promise<string>((done) => {
			resolve = done;
		});
		let seen: { pending: boolean; hidden: boolean; mutations: number } | null = null;
		const records: MutationRecord[] = [];
		const observer = new MutationObserver((batch) => records.push(...batch));
		const app = mount(ResumeApp, {
			value,
			probe: () => {
				records.push(...observer.takeRecords());
				seen = {
					pending: app.container.querySelector('#resume-pending') !== null,
					hidden:
						(app.container.querySelector('#resume-static') as HTMLElement).style.display === 'none',
					mutations: records.length,
				};
			},
		});
		try {
			expect(app.find('#resume-pending').textContent).toBe('pending');
			expect((app.find('#resume-static') as HTMLElement).style.display).toBe('none');
			observer.observe(app.container, {
				childList: true,
				subtree: true,
				attributes: true,
				characterData: true,
			});
			await act(() => resolve('resumed'));
			// While the resumed primary rendered, the screen was still the fallback's.
			// Still pending: a component whose earlier render suspended mounts its
			// first template in place (#2043 step 2 remainder), so only the screen's
			// own state is asserted here.
			expect(seen).toMatchObject({ pending: true, hidden: true });
			expect(app.find('#resume-value').textContent).toBe('resumed');
			expect((app.find('#resume-static') as HTMLElement).style.display).toBe('');
			expect(app.findAll('#resume-pending')).toHaveLength(0);
		} finally {
			observer.disconnect();
			app.unmount();
		}
	});
});

describe('boundary arms change at commit', () => {
	const ready = (value: string) =>
		({ status: 'fulfilled', value, then() {} }) as unknown as PromiseLike<string>;
	const never = () => new Promise<string>(() => {});

	for (const priority of ['urgent', 'transition'] as const) {
		// A transition suspends into a resolved boundary, which holds it; an
		// urgent render suspends outside every boundary. Either way the render
		// is dropped after its boundaries built catch, pending and restarted arms.
		it(`a dropped ${priority} render builds boundary arms without touching committed DOM`, async () => {
			const initial: BoundaryArmsProps = { fail: false, shown: ready('shown'), waiting: never() };
			const app = mount(BoundaryArmsApp, initial);
			const records: MutationRecord[] = [];
			const observer = new MutationObserver((batch) => records.push(...batch));
			const render = (props: Partial<BoundaryArmsProps>) =>
				act(() => {
					const next = () => app.root.render(BoundaryArmsApp, { ...initial, ...props });
					if (priority === 'transition') startTransition(next);
					else next();
				});
			const visible = () =>
				app
					.findAll('i, p, s')
					.filter((node) => (node as HTMLElement).style.display !== 'none')
					.map((node) => node.textContent);
			try {
				expect(visible()).toEqual(['shown', 'waiting']);
				const before = app.html();
				observer.observe(app.container, {
					childList: true,
					subtree: true,
					attributes: true,
					characterData: true,
				});
				// A transition would hold `shown`'s resolved primary rather than show
				// its fallback, so only the urgent render suspends it.
				const change = {
					fail: true,
					shown: priority === 'urgent' ? never() : initial.shown,
					waiting: never(),
				};
				const suspend = new Promise(() => {});
				await render(
					priority === 'urgent' ? { ...change, gate: suspend } : { ...change, hold: suspend },
				);
				records.push(...observer.takeRecords());
				expect(records.map((record) => `${record.type} ${record.target.nodeName}`)).toEqual([]);
				expect(app.html()).toBe(before);

				// The render that completes commits the same arms, and the restarted
				// primary reveals once its value arrives.
				let resolve!: (value: string) => void;
				const waiting = new Promise<string>((done) => {
					resolve = done;
				});
				await render({ ...change, waiting });
				const caught = ['try caught', 'boundary caught'];
				const shown = priority === 'urgent' ? ['shown pending'] : ['shown'];
				expect(visible()).toEqual([...caught, ...shown, 'waiting']);
				await act(() => resolve('arrived'));
				expect(visible()).toEqual([...caught, ...shown, 'arrived']);
			} finally {
				observer.disconnect();
				app.unmount();
			}
		});
	}
});

// Count the comment markers named `data` in `root`.
function markers(root: Node, data: string): number {
	let count = 0;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
	for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
		if ((node as Comment).data === data) count++;
	return count;
}

describe('a late error boundary', () => {
	it('builds an error boundary new under committed DOM off-document', async () => {
		let resolve!: (value: string) => void;
		const value = new Promise<string>((done) => {
			resolve = done;
		});
		let during: number | null = null;
		const app = mount(LateBoundaryApp, {
			value,
			probe: () => {
				during = markers(app.container, 'try');
			},
		});
		try {
			expect(app.find('#late-pending').textContent).toBe('pending');
			const before = markers(app.container, 'try');
			await act(() => resolve('late'));
			// The resumed render built the new boundary's markers off-document; its
			// commit inserted them with the content.
			expect(during).toBe(before);
			expect(markers(app.container, 'try')).toBe(before + 1);
			expect(app.find('#late-value').textContent).toBe('late');
		} finally {
			app.unmount();
		}
	});
});

// A de-opt list through a value hole, ending in a component that observes the
// DOM while its siblings render.
function DeoptChip(props: { id: string }) {
	return createElement('mark', { id: props.id }, 'chip ' + props.id);
}

// Every comment in `root`.
function comments(root: Node): number {
	let count = 0;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
	while (walker.nextNode() !== null) count++;
	return count;
}

function DeoptList(props: { items: unknown[] }) {
	return createElement('ul', { id: 'deopt' }, props.items);
}

function ProbeChip(props: { probe: () => void }) {
	props.probe();
	return createElement('mark', { id: 'in' }, 'chip in');
}

describe('deleted rows retire with the render that deletes them', () => {
	it("skips a deleted row's own update queued in the same drain", () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const log: string[] = [];
		let setLast: (n: number) => void = () => {};
		const expose = (set: (n: number) => void) => {
			setLast = set;
		};
		try {
			flushSync(() => root.render(RetireList, { ids: [1, 2], log, expose }));
			const setRow2 = setLast;
			log.length = 0;
			flushSync(() => {
				root.render(RetireList, { ids: [1], log, expose });
				setRow2(5);
			});
			// The root render deleted row 2, which therefore never renders its update.
			expect(log).toEqual(['row 1:0']);
			expect(container.querySelector('#retire')!.textContent).toBe('0');
		} finally {
			root.unmount();
			container.remove();
		}
	});
});

describe('a one-host arm lands at commit', () => {
	it.each(['connected element', 'detached element', 'fragment', 'shadow root'] as const)(
		'renders a swapped-in arm detached and inserts its root at commit in a %s',
		(kind) => {
			const host = document.createElement('div');
			if (kind === 'connected element' || kind === 'shadow root') document.body.appendChild(host);
			const container =
				kind === 'fragment'
					? document.createDocumentFragment()
					: kind === 'shadow root'
						? host.attachShadow({ mode: 'open' })
						: host;
			const root = createRoot(container);
			const controls = {} as ArmSwapControls;
			let during: MutationRecord[] | null = null;
			const observer = new MutationObserver(() => {});
			const probe = () => {
				during = observer.takeRecords();
			};
			try {
				flushSync(() => root.render(ArmSwapApp, { start: false, controls, probe }));
				const owner = container.querySelector('#arm-swap')!;
				const tail = owner.querySelector('i');
				observer.observe(container, { childList: true, subtree: true, attributes: true });
				flushSync(() => root.render(ArmSwapApp, { start: true, controls, probe }));
				// The probe renders after the arm: nothing had touched the DOM.
				expect(during).toEqual([]);
				expect([...owner.children].map((el) => el.localName)).toEqual(['b', 'i', 'u']);
				expect(owner.querySelector('i')).toBe(tail);
				// The commit's own insert.
				observer.takeRecords();
				flushSync(() => root.render(ArmSwapApp, { start: false, controls, probe }));
				expect(during).toEqual([]);
				expect([...owner.children].map((el) => el.localName)).toEqual(['i', 'u']);
			} finally {
				observer.disconnect();
				root.unmount();
				host.remove();
			}
		},
	);

	for (const start of [false, true]) {
		it(`drops an arm that a later swap of the same render replaced (starting ${start ? 'on' : 'off'})`, async () => {
			const container = document.createElement('div');
			document.body.appendChild(container);
			const root = createRoot(container);
			const controls = {} as ArmSwapControls;
			const probe = () => {};
			try {
				flushSync(() => root.render(ArmSwapApp, { start, controls, probe }));
				const shown = () =>
					[...container.querySelector('#arm-swap')!.children].map((el) => el.localName);
				expect(shown()).toEqual(start ? ['b', 'i', 'u'] : ['i', 'u']);
				await act(() => controls.move());
				expect(shown()).toEqual(start ? ['b', 'i', 'u'] : ['i', 'u']);
				expect(container.querySelectorAll('.lone')).toHaveLength(start ? 1 : 0);
			} finally {
				root.unmount();
				container.remove();
			}
		});
	}
});

describe('de-opt markers change at commit', () => {
	it('renders a mapped host row that becomes a component against the pair its commit lands', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		let during: MutationRecord[] | null = null;
		const observer = new MutationObserver(() => {});
		const probe = () => {
			during = observer.takeRecords();
		};
		const [one, two] = [{ id: 1 }, { id: 2 }];
		// An exotic map: the second row is a host descriptor, then a component.
		const rows = (...order: Array<MappedRow | 'host'>): MappedProps['rows'] => ({
			map<T>(callback: (row: MappedRow, index: number) => T): T[] {
				return order.map((row, index) =>
					row === 'host'
						? (createElement('li', { key: 2, id: 'host' }, 'host') as T)
						: callback(row, index),
				);
			},
		});
		const ids = () => [...container.querySelectorAll('#mapped li')].map((li) => li.id);
		try {
			flushSync(() => root.render(MappedApp, { rows: rows(one, 'host'), probe }));
			const host = container.querySelector('#host')!;
			const chip = container.querySelector('#mapped-1');
			const markersOfOne = comments(container.querySelector('#mapped')!);
			observer.observe(container, {
				childList: true,
				subtree: true,
				attributes: true,
				characterData: true,
			});
			// The row moves and becomes a component in one render.
			flushSync(() => root.render(MappedApp, { rows: rows(two, one), probe }));
			expect(during).toEqual([]);
			expect(host.isConnected).toBe(false);
			expect(container.querySelector('#mapped-1')).toBe(chip);
			expect(ids()).toEqual(['mapped-2', 'mapped-1']);
			expect(container.querySelector('#mapped-2')!.textContent).toBe('chip 2');
			// Its range is the pair the commit landed: it moves and leaves whole.
			flushSync(() => root.render(MappedApp, { rows: rows(one, two), probe }));
			expect(ids()).toEqual(['mapped-1', 'mapped-2']);
			flushSync(() => root.render(MappedApp, { rows: rows(one), probe }));
			expect(ids()).toEqual(['mapped-1']);
			// The self-marked host had no markers, so only the first row's remain.
			expect(comments(container.querySelector('#mapped')!)).toBe(markersOfOne);
		} finally {
			observer.disconnect();
			root.unmount();
			container.remove();
		}
	});

	it('promotes a self-marked item to its marker pair at commit', () => {
		let observing = false;
		let during: MutationRecord[] | null = null;
		const records: MutationRecord[] = [];
		const observer = new MutationObserver((batch) => records.push(...batch));
		// A fresh descriptor each render, so the probe renders after its siblings.
		const probe = () =>
			createElement(DeoptProbe, {
				key: 'probe',
				probe: () => {
					if (observing) during = observer.takeRecords();
				},
			});
		const pure = createElement('li', { key: 'a', id: 'a' }, 'a');
		const chip = createElement(DeoptChip, { key: 'a', id: 'a' });
		const app = mount(DeoptList as any, {
			items: [pure, createElement('li', { key: 'b' }, 'b'), probe()],
		});
		try {
			const ul = app.find('#deopt');
			const before = comments(ul);
			observer.observe(app.container, {
				childList: true,
				subtree: true,
				attributes: true,
				characterData: true,
			});
			observing = true;
			app.update(DeoptList as any, {
				items: [chip, createElement('li', { key: 'b' }, 'b'), probe()],
			});
			// The item rendered its component against the pair its commit lands.
			expect(during).toEqual([]);
			expect(app.find('#a').textContent).toBe('chip a');
			expect(comments(ul)).toBe(before + 2);
		} finally {
			observer.disconnect();
			app.unmount();
		}
	});

	it('adopts an upgraded root host and lands its marker pair at commit', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		let during: MutationRecord[] | null = null;
		const observer = new MutationObserver(() => {});
		const probe = () => {
			during = observer.takeRecords();
		};
		try {
			// A lone pure host renders markerless at the root.
			flushSync(() => root.render(createElement('div', { id: 'upgrade' }, 'plain')));
			const host = container.querySelector('#upgrade');
			expect(comments(container)).toBe(0);
			observer.observe(container, {
				childList: true,
				subtree: true,
				attributes: true,
				characterData: true,
			});
			flushSync(() =>
				root.render(createElement('div', { id: 'upgrade' }, createElement(ProbeChip, { probe }))),
			);
			// The upgrade adopted the host; its pair joined it with the commit.
			expect(during).toEqual([]);
			expect(container.querySelector('#upgrade')).toBe(host);
			expect(container.querySelector('#in')!.textContent).toBe('chip in');
			expect(comments(container)).toBeGreaterThan(0);
		} finally {
			observer.disconnect();
			root.unmount();
			container.remove();
		}
	});

	it('keeps the outgoing root host untouched until its keyed replacement commits', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const observer = new MutationObserver(() => {});
		let during: MutationRecord[] | null = null;
		let observedInput: HTMLInputElement | null = null;
		const App = (props: { child: ReturnType<typeof createElement> }) => props.child;
		try {
			flushSync(() =>
				root.render(App, {
					child: createElement(
						'div',
						{ id: 'host' },
						createElement('input', { defaultValue: 'initial' }),
					),
				}),
			);
			const outgoingHost = container.querySelector('#host');
			const outgoingInput = container.querySelector('input')!;
			outgoingInput.value = 'typed';
			observer.observe(container, { childList: true, subtree: true });
			flushSync(() =>
				root.render(App, {
					child: createElement(
						'div',
						{ key: 'keyed', id: 'host' },
						createElement('input', { defaultValue: 'replacement' }),
						createElement(DeoptProbe, {
							probe: () => {
								during = observer.takeRecords();
								observedInput = container.querySelector('input');
							},
						}),
					),
				}),
			);
			expect(during).toEqual([]);
			expect(observedInput).toBe(outgoingInput);
			expect(outgoingInput.value).toBe('typed');
			expect(container.querySelector('#host')).not.toBe(outgoingHost);
			expect(container.querySelector('input')!.value).toBe('replacement');
		} finally {
			observer.disconnect();
			root.unmount();
			container.remove();
		}
	});
});
