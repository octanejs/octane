import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, resetFloatResourceState, startTransition } from '../src/index.js';
import { act } from './_helpers';
import {
	FloatCommitApp,
	RejectedOptionName,
	type FloatCommitProps,
} from './_fixtures/float-commit.tsrx';

// Render computes, commit writes (#2043): a Float resource or resource hint a
// render requests joins document.head as that render commits, in render order,
// and a render that never commits inserts nothing.

type Priority = 'urgent' | 'transition';

const FLOAT = '[data-oct-hint], [data-precedence], [data-oct-res]';

// The head's Float entries in document order.
function head(): string[] {
	return Array.from(document.head.querySelectorAll(FLOAT), (el) => {
		const id = el.getAttribute('href') ?? el.getAttribute('data-href') ?? el.getAttribute('src');
		const group = el.getAttribute('data-precedence');
		return `${el.localName}${group === null ? '' : `[${group}]`} ${id}`;
	});
}

// Discovery order: a sheet group starts after the last group, every other
// resource appends to the head.
const committed = (hints: string) => [
	`link /${hints}-hero.png`,
	'link[init] /commit-init.css',
	'link[app] /commit-app.css',
	'style[app] commit-inline',
	`script /${hints}-module.mjs`,
	'script /commit-async.js',
];

describe('Float resources insert at commit', () => {
	const cleanups: Array<() => void> = [];
	afterEach(() => {
		for (const cleanup of cleanups.splice(0)) cleanup();
		document.head.querySelectorAll(FLOAT).forEach((el) => el.remove());
		resetFloatResourceState();
	});

	function setup(hints: string, show: boolean) {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		// Every record the document produces, delivered or still queued.
		const records: MutationRecord[] = [];
		const observer = new MutationObserver((batch) => records.push(...batch));
		const mutations = () => {
			records.push(...observer.takeRecords());
			return records.splice(0);
		};
		let during: MutationRecord[] | null = null;
		const props: FloatCommitProps = {
			hints,
			show,
			probe: () => {
				during = mutations();
			},
		};
		cleanups.push(() => {
			observer.disconnect();
			root.unmount();
			container.remove();
		});
		root.render(FloatCommitApp, props);
		observer.observe(document, {
			childList: true,
			subtree: true,
			attributes: true,
			characterData: true,
		});
		const render = async (next: Partial<FloatCommitProps>, priority: Priority) => {
			mutations();
			during = null;
			await act(() => {
				const update = () => root.render(FloatCommitApp, { ...props, ...next });
				if (priority === 'transition') startTransition(update);
				else update();
			});
			return during;
		};
		return { container, mutations, render };
	}

	it('a mount writes no head entry while it renders', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		const observer = new MutationObserver(() => {});
		observer.observe(document, {
			childList: true,
			subtree: true,
			attributes: true,
			characterData: true,
		});
		let during: MutationRecord[] | null = null;
		try {
			root.render(FloatCommitApp, {
				hints: 'mount',
				show: true,
				probe: () => {
					during = observer.takeRecords();
				},
			});
			expect(during).toEqual([]);
			expect(head()).toEqual(committed('mount'));
		} finally {
			observer.disconnect();
			root.unmount();
			container.remove();
		}
	});

	it('skips an option name the platform rejects instead of failing the commit', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		try {
			root.render(RejectedOptionName, {});
			expect(container.textContent).toBe('committed');
			const sheet = document.head.querySelector('link[href="/commit-rejected.css"]')!;
			expect(sheet.getAttribute('media')).toBe('print');
			expect(sheet.getAttributeNames()).not.toContain('not a name');
		} finally {
			root.unmount();
			container.remove();
		}
	});

	for (const priority of ['urgent', 'transition'] as const) {
		it(`an update writes no head entry until its commit (${priority})`, async () => {
			const { container, render } = setup(`update-${priority}`, false);
			expect(head()).toEqual([]);
			expect(await render({ show: true }, priority)).toEqual([]);
			expect(head()).toEqual(committed(`update-${priority}`));
			expect(container.querySelector('b')?.textContent).toBe('resources');
		});

		it(`a dropped ${priority} render inserts nothing`, async () => {
			const { container, mutations, render } = setup(`dropped-${priority}`, false);
			// A sibling outside every boundary suspends: the root keeps its screen.
			expect(await render({ show: true, gate: new Promise(() => {}) }, priority)).toEqual([]);
			expect(mutations()).toEqual([]);
			expect(head()).toEqual([]);
			expect(container.querySelector('b')).toBeNull();

			// The next render that completes requests them again and commits them.
			expect(await render({ show: true }, priority)).toEqual([]);
			expect(head()).toEqual(committed(`dropped-${priority}`));
		});
	}
});
