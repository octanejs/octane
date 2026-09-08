import { describe, expect, it } from 'vitest';
import { flushEffects, mount } from './_helpers';
import { createRoot, hydrateRoot } from '../src/index.js';
import { renderToString } from 'octane/server';
import { loadServerFixture } from './_server-fixture';
import {
	BranchSelfUpdate,
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
