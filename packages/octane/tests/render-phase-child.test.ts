import { describe, expect, it } from 'vitest';
import { act, flushEffects, mount } from './_helpers';
import { createRoot, hydrateRoot, startTransition } from '../src/index.js';
import { renderToString } from 'octane/server';
import { loadServerFixture } from './_server-fixture';
import {
	BranchSelfUpdate,
	BranchAdmission,
	BranchCleanupReentry,
	BranchSiblingAdmission,
	EmptyBranchAdmission,
	DirectSelfUpdate,
	InlineSelfUpdate,
	InlineHostForSelfUpdate,
	InlineHostMapSelfUpdate,
	InlinePortalSelfUpdate,
	InlineActivitySelfUpdate,
	InlineListSelfUpdate,
	InlineBranchSelfUpdate,
	ListSelfUpdate,
	MultipleSelfUpdates,
	NestedSelfUpdate,
	PropDerivedSelfUpdate,
	ReducerSelfUpdate,
	ReturnedSelfUpdate,
	UnchangedAfterHostReplay,
	SuspenseBranchAdmission,
} from './_fixtures/render-phase-child.tsrx';

const cases = [
	['direct', DirectSelfUpdate],
	['returned', ReturnedSelfUpdate],
	['inline', InlineSelfUpdate],
	['branch', BranchSelfUpdate],
	['list', ListSelfUpdate],
	['inline list', InlineListSelfUpdate],
	['inline activity', InlineActivitySelfUpdate],
	['reducer', ReducerSelfUpdate],
] as const;

describe('children of render-phase state updates', () => {
	it.each(['B', 'empty'] as const)(
		'keeps the applied branch visible to a later sibling until a successful %s commits',
		(choice) => {
			const Component = choice === 'empty' ? EmptyBranchAdmission : BranchAdmission;
			const refs: Array<Element | null> = [];
			const observed: Array<{
				arm: Element | null;
				draft: string | undefined;
				refs: Array<Element | null>;
				sections: number;
				text: string | null;
			}> = [];
			let inspect = false;
			const props = {
				choice: 'A' as const,
				armRef: (node: Element | null) => refs.push(node),
				observe() {
					if (!inspect) return;
					const arm = root.container.querySelector('[data-arm]');
					observed.push({
						arm,
						draft: arm?.querySelector('input')?.value,
						refs: [...refs],
						sections: root.container.querySelectorAll('section').length,
						text: root.container.textContent,
					});
				},
			};
			const root = mount(Component, props);
			try {
				flushEffects();
				const arm = root.find('[data-arm="A"]');
				arm.querySelector('input')!.value = 'unsaved A';
				const committed = {
					arm,
					draft: 'unsaved A',
					refs: [...refs],
					sections: root.container.querySelectorAll('section').length,
					text: root.container.textContent,
				};
				expect(committed.sections).toBe(1);
				expect(committed.text).toBe('Aready');
				expect(committed.refs).toEqual([arm]);
				inspect = true;
				root.update(Component, { ...props, choice });
				expect(observed.length).toBeGreaterThan(0);
				for (const view of observed) expect(view).toEqual(committed);
				flushEffects();
				expect(root.container.querySelector('[data-arm="A"]')).toBeNull();
				expect(arm.isConnected).toBe(false);
				if (choice === 'B') {
					const next = root.find('[data-arm="B"]');
					expect(next.querySelector('input')?.value).toBe('B');
					expect(refs).toEqual([arm, null, next]);
				} else {
					expect(root.container.querySelector('[data-arm]')).toBeNull();
					expect(refs).toEqual([arm, null]);
				}
			} finally {
				root.unmount();
			}
		},
	);

	it('cancels a suspended empty branch without unmounting its applied arm, even after a late resolve', async () => {
		const refs: Array<Element | null> = [];
		const observed: Array<{
			arm: Element | null;
			draft: string | undefined;
			refs: Array<Element | null>;
		}> = [];
		let inspect = false;
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		const props = {
			choice: 'A' as const,
			armRef: (node: Element | null) => refs.push(node),
			observe() {
				if (!inspect) return;
				const arm = root.container.querySelector('[data-arm]');
				observed.push({
					arm,
					draft: arm?.querySelector('input')?.value,
					refs: [...refs],
				});
			},
		};
		const root = mount(EmptyBranchAdmission, props);
		try {
			flushEffects();
			const arm = root.find('[data-arm="A"]');
			const input = arm.querySelector('input')!;
			input.value = 'still editing A';
			const committed = { arm, draft: 'still editing A', refs: [...refs] };
			inspect = true;
			await act(() =>
				root.root.render(EmptyBranchAdmission, { ...props, choice: 'empty', promise }),
			);
			expect(observed.length).toBeGreaterThan(0);
			for (const view of observed) expect(view).toEqual(committed);
			expect(root.find('[data-arm="A"]')).toBe(arm);
			expect(refs).toEqual(committed.refs);
			inspect = false;
			await act(() => root.root.render(EmptyBranchAdmission, props));
			expect(root.find('[data-arm="A"]')).toBe(arm);
			expect(arm.querySelector('input')).toBe(input);
			expect(input.value).toBe('still editing A');
			await act(() => resolve('discarded'));
			expect(root.find('[data-arm="A"]')).toBe(arm);
			expect(root.find('footer').textContent).toBe('ready');
			expect(refs).toEqual([arm]);
		} finally {
			root.unmount();
		}
		expect(refs).toEqual([expect.any(Element), null]);
	});

	it('admits a suspended else arm and its ref lifetime only when a later sibling finishes', async () => {
		const refs: Array<Element | null> = [];
		const observed: Array<{
			arm: Element | null;
			draft: string | undefined;
			refs: Array<Element | null>;
		}> = [];
		let inspect = false;
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		const props = {
			choice: 'A' as const,
			armRef: (node: Element | null) => refs.push(node),
			observe() {
				if (!inspect) return;
				const arm = root.container.querySelector('[data-arm]');
				observed.push({
					arm,
					draft: arm?.querySelector('input')?.value,
					refs: [...refs],
				});
			},
		};
		const root = mount(SuspenseBranchAdmission, props);
		try {
			flushEffects();
			const arm = root.find('[data-arm="A"]');
			arm.querySelector('input')!.value = 'private draft';
			const committed = { arm, draft: 'private draft', refs: [...refs] };
			inspect = true;
			await act(() =>
				startTransition(() =>
					root.root.render(SuspenseBranchAdmission, { ...props, choice: 'B', promise }),
				),
			);
			expect(observed.length).toBeGreaterThan(0);
			for (const view of observed) expect(view).toEqual(committed);
			expect(root.find('[data-arm="A"]')).toBe(arm);
			expect(root.container.querySelector('[data-waiting]')).toBeNull();
			expect(refs).toEqual(committed.refs);
			inspect = false;
			await act(() => resolve('done'));
			const next = root.find('[data-arm="B"]');
			expect(root.container.querySelector('[data-arm="A"]')).toBeNull();
			expect(arm.isConnected).toBe(false);
			expect(next.querySelector('input')?.value).toBe('B');
			expect(root.find('footer').textContent).toBe('done');
			expect(refs).toEqual([arm, null, next]);
		} finally {
			root.unmount();
		}
		expect(refs).toEqual([expect.any(Element), null, expect.any(Element), null]);
	});

	it('releases a deleted sibling ref even when a later new arm supersedes itself during commit', () => {
		const firstRefs: Array<Element | null> = [];
		const laterRefs: Array<Element | null> = [];
		const props = {
			removeFirst: false,
			alternate: false,
			firstRef: (node: Element | null) => firstRefs.push(node),
			laterRef(node: Element | null) {
				laterRefs.push(node);
				if (node?.textContent === 'B') {
					root.root.render(BranchSiblingAdmission, {
						...props,
						removeFirst: true,
						alternate: false,
					});
				}
			},
		};
		const root = mount(BranchSiblingAdmission, props);
		try {
			const first = root.find('[data-first]');
			const initialLater = root.find('[data-later]');
			expect(firstRefs).toEqual([first]);
			expect(laterRefs).toEqual([initialLater]);
			root.update(BranchSiblingAdmission, { ...props, removeFirst: true, alternate: true });
			expect(root.container.querySelector('[data-first]')).toBeNull();
			expect(first.isConnected).toBe(false);
			expect(firstRefs).toEqual([first, null]);
			const latest = root.find('[data-later]');
			expect(root.findAll('section')).toEqual([latest]);
			expect(latest.textContent).toBe('A');
			expect(laterRefs.at(-1)).toBe(latest);
		} finally {
			root.unmount();
		}
		expect(firstRefs).toHaveLength(2);
		expect(laterRefs.at(-1)).toBeNull();
	});

	it('places the newest arm before a permanent sibling when outgoing layout cleanup supersedes the replacement', () => {
		const refs: Array<Element | null> = [];
		const props = {
			choice: 'A' as const,
			armRef: (node: Element | null) => refs.push(node),
			cleanup() {
				root.root.render(BranchCleanupReentry, { ...props, choice: 'C' });
			},
		};
		const root = mount(BranchCleanupReentry, props);
		try {
			const original = root.find('[data-arm="A"]');
			const footer = root.find('footer');
			const input = footer.querySelector('input')!;
			input.value = 'independent edit';
			expect(refs).toEqual([original]);
			root.update(BranchCleanupReentry, { ...props, choice: 'B' });
			expect(root.container.querySelector('[data-arm="A"]')).toBeNull();
			expect(root.container.querySelector('[data-arm="B"]')).toBeNull();
			const latest = root.find('[data-arm="C"]');
			expect([...root.find('article').children]).toEqual([latest, footer]);
			expect(original.isConnected).toBe(false);
			expect(footer.querySelector('input')).toBe(input);
			expect(input.value).toBe('independent edit');
			expect(refs).toEqual([original, null, latest]);
		} finally {
			root.unmount();
		}
		expect(refs).toEqual([expect.any(Element), null, expect.any(Element), null]);
	});

	it('does not publish an intermediate host answer when a replay returns to the committed value', () => {
		const seen = new Set<string>();
		let inspect = false;
		const observe = () => {
			if (inspect) {
				const output = root.find('[data-replayed]');
				seen.add(
					[
						output.textContent,
						output.getAttribute('title'),
						output.getAttribute('aria-label'),
					].join('/'),
				);
			}
		};
		const root = mount(UnchangedAfterHostReplay, { revision: 0, observe });
		try {
			const output = root.find('[data-replayed]');
			const text = output.firstChild;
			expect([
				output.textContent,
				output.getAttribute('title'),
				output.getAttribute('aria-label'),
			]).toEqual(['A', 'A', 'A']);
			// A third party owns these accessibility and text edits while the
			// application's committed values remain unchanged.
			output.firstChild!.nodeValue = 'spoken A';
			output.setAttribute('title', 'title A');
			output.setAttribute('aria-label', 'label A');
			inspect = true;
			root.update(UnchangedAfterHostReplay, { revision: 1, observe });
			expect(seen).toEqual(new Set(['spoken A/title A/label A']));
			expect(root.find('[data-replayed]')).toBe(output);
			expect(output.firstChild).toBe(text);
			expect([
				output.textContent,
				output.getAttribute('title'),
				output.getAttribute('aria-label'),
			]).toEqual(['spoken A', 'title A', 'label A']);
		} finally {
			root.unmount();
		}
	});

	it.each(cases)('initializes children from the settled parent state (%s)', (_, Component) => {
		const log: string[] = [];
		const root = mount(Component, { log: (value) => log.push(value) });
		try {
			flushEffects();
			expect(root.find('output').textContent).toBe('5:5');
			expect(log).not.toContain('child render 0');
			expect(log).toContain('effect 5');
		} finally {
			root.unmount();
		}
	});

	it.each(cases)('does not render discarded child inputs (%s)', (_, Component) => {
		const root = mount(Component, { log: () => {}, rejectZero: true });
		try {
			expect(root.find('output').textContent).toBe('5:5');
		} finally {
			root.unmount();
		}
	});

	it.each([false, true])(
		'settles portal inputs before mounting children (reject discarded=%s)',
		(rejectZero) => {
			const target = document.createElement('aside');
			document.body.appendChild(target);
			const log: string[] = [];
			let root: ReturnType<typeof mount> | undefined;
			try {
				root = mount(InlinePortalSelfUpdate, {
					target,
					rejectZero,
					log: (value) => log.push(value),
				});
				flushEffects();
				expect(target.querySelector('output')?.textContent).toBe('5:5');
				expect(log).not.toContain('child render 0');
				expect(log).toContain('effect 5');
			} finally {
				root?.unmount();
				expect(target.innerHTML).toBe('');
				target.remove();
			}
		},
	);

	it.each([
		['for', InlineHostForSelfUpdate],
		['map', InlineHostMapSelfUpdate],
	] as const)('settles host updates before preparing a list (%s)', (_, Component) => {
		const items = Array.from({ length: 20 }, (_, index) => ({
			id: index + 1,
			label: `row ${index + 1}`,
		}));
		const root = mount(Component, { items });
		try {
			expect(root.find('ul').getAttribute('data-selected')).toBe('1');
			expect(root.findAll('li').map((row) => row.textContent)).toEqual(
				items.map((row) => row.label),
			);
			expect(root.findAll('.selected').map((row) => row.textContent)).toEqual(['row 1']);
		} finally {
			root.unmount();
		}
	});

	it('settles nested single-host components before their parent records DOM ownership', () => {
		const root = mount(NestedSelfUpdate, { log: () => {} });
		expect(root.container.textContent).toBe('before5:5after');
		root.unmount();
		expect(root.container.innerHTML).toBe('');
	});

	it.each([
		['setup', PropDerivedSelfUpdate],
		['condition', InlineBranchSelfUpdate],
	] as const)(
		'preserves a child across a discarded branch during a prop-derived update (%s)',
		(_, Component) => {
			const props = { log: () => {}, target: 1 };
			const root = mount(Component, props);
			try {
				const output = root.find('output');
				root.update(Component, { ...props, target: 5 });
				expect(root.find('output')).toBe(output);
				expect(output.textContent).toBe('5:1');
			} finally {
				root.unmount();
			}
		},
	);

	it('executes all setup updates before replaying the component', () => {
		const root = mount(MultipleSelfUpdates);
		try {
			expect(root.find('output').textContent).toBe('5:2');
		} finally {
			root.unmount();
		}
	});

	it('settles the initial public root render before it returns', () => {
		const container = document.createElement('div');
		const root = createRoot(container);
		try {
			root.render(DirectSelfUpdate, { log: () => {} });
			expect(container.textContent).toBe('5:5');
		} finally {
			root.unmount();
		}
	});

	it('hydrates the settled child without comparing discarded output', () => {
		const server = loadServerFixture('packages/octane/tests/_fixtures/render-phase-child.tsrx');
		const props = { log: () => {} };
		const { html } = renderToString(server.DirectSelfUpdate, props);
		const container = document.createElement('div');
		container.innerHTML = html;
		const output = container.querySelector('output');
		expect(output?.textContent).toBe('5:5');
		const errors: unknown[] = [];
		const root = hydrateRoot(container, DirectSelfUpdate, props, {
			onRecoverableError: (error) => errors.push(error),
		});
		try {
			expect(container.querySelector('output')).toBe(output);
			expect(output?.textContent).toBe('5:5');
			expect(errors).toEqual([]);
		} finally {
			root.unmount();
		}
	});
});
