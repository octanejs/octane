import { describe, expect, it } from 'vitest';
import * as ServerRT from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { loadServerFixture } from './_server-fixture.js';
import { mount } from './_helpers.js';
import { NestedStoryFeed, SparseCaptureFeed } from './_fixtures/nested-template-directives.tsrx';

const FIXTURE = 'packages/octane/tests/_fixtures/nested-template-directives.tsrx';
const stories = [
	{ id: 'a', label: 'Compiler fixes nested directives' },
	{ id: 'b', label: 'This story is unavailable' },
	{ id: 'c', label: 'Hydration adopts the feed' },
];

function readStory(story: (typeof stories)[number]) {
	if (story.id === 'b') throw new Error('offline');
	return story.label;
}

function readAvailableStory(story: (typeof stories)[number]) {
	return story.label;
}

describe('nested template directives', () => {
	it('keeps captured values with their keyed rows across sparse nested arms', () => {
		const original = [
			{ id: 'a', label: 'A', selected: true },
			{ id: 'b', label: 'B', selected: false },
			{ id: 'c', label: 'C', selected: true },
		];
		const props = { rows: original, prefix: 'before', suffix: ' after' };
		const result = mount(SparseCaptureFeed, props);
		try {
			expect(result.findAll('[data-row]').map((node) => node.textContent)).toEqual([
				'A after',
				'plain: B',
				'C after',
			]);
			const first = result.find('[data-row="a"]');
			const middle = result.find('[data-row="b"]');
			const last = result.find('[data-row="c"]');

			result.update(SparseCaptureFeed, {
				...props,
				rows: [original[2], original[1], original[0]],
				prefix: 'new beginning',
				suffix: ' updated',
			});
			expect(result.findAll('[data-row]').map((node) => node.textContent)).toEqual([
				'C updated',
				'plain: B',
				'A updated',
			]);
			expect(result.find('[data-row="a"]')).toBe(first);
			expect(result.find('[data-row="b"]')).toBe(middle);
			expect(result.find('[data-row="c"]')).toBe(last);

			result.update(SparseCaptureFeed, {
				...props,
				rows: [
					original[2],
					{ ...original[1], selected: true },
					{ ...original[0], selected: false },
				],
				suffix: ' switched',
			});
			expect(result.findAll('[data-row]').map((node) => node.textContent)).toEqual([
				'C switched',
				'B switched',
				'plain: A',
			]);
			expect(result.find('[data-row="c"]')).toBe(last);

			result.update(SparseCaptureFeed, {
				rows: [],
				prefix: 'new beginning',
				suffix: ' updated',
			});
			expect(result.findAll('[data-row]')).toHaveLength(0);
			expect(result.find('#sparse-empty').textContent).toBe('empty: new beginning');

			result.update(SparseCaptureFeed, {
				rows: [original[0]],
				prefix: 'ignored',
				suffix: ' again',
			});
			expect(result.find('[data-row="a"]').textContent).toBe('A again');
			expect(result.findAll('#sparse-empty')).toHaveLength(0);
		} finally {
			result.unmount();
		}
	});

	it('renders and reorders stories with per-story error containment', () => {
		const result = mount(NestedStoryFeed as any, {
			visible: true,
			stories,
			read: readStory,
		});

		expect(
			result.findAll('[data-story-id]').map((row) => row.getAttribute('data-story-id')),
		).toEqual(['a', 'b', 'c']);
		expect(result.find('[data-story-id="a"]').textContent).toBe('Compiler fixes nested directives');
		expect(result.find('[data-story-id="b"]').textContent).toBe('Unavailable: offline');
		const first = result.find('[data-story-id="a"]');
		const last = result.find('[data-story-id="c"]');

		result.update(NestedStoryFeed as any, {
			visible: true,
			stories: [stories[2], stories[1], stories[0]],
			read: readStory,
		});
		expect(
			result.findAll('[data-story-id]').map((row) => row.getAttribute('data-story-id')),
		).toEqual(['c', 'b', 'a']);
		expect(result.find('[data-story-id="a"]')).toBe(first);
		expect(result.find('[data-story-id="c"]')).toBe(last);

		result.update(NestedStoryFeed as any, {
			visible: false,
			stories,
			read: readStory,
		});
		expect(result.find('#hidden-feed').textContent).toBe('Stories hidden');
		expect(result.findAll('[data-story-id]')).toHaveLength(0);
		result.unmount();
	});

	it('server-renders every story and hydrates the existing rows', async () => {
		const server = loadServerFixture(FIXTURE);
		const props = { visible: true, stories, read: readAvailableStory };
		const { html } = await ServerRT.renderToString(server.NestedStoryFeed, props);
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const first = container.querySelector('[data-story-id="a"]');
		const middle = container.querySelector('[data-story-id="b"]');
		const last = container.querySelector('[data-story-id="c"]');
		expect(first?.textContent).toBe('Compiler fixes nested directives');
		expect(middle?.textContent).toBe('This story is unavailable');
		expect(last?.textContent).toBe('Hydration adopts the feed');

		const root = hydrateRoot(container, NestedStoryFeed, props);
		flushSync(() => {});
		expect(container.querySelector('[data-story-id="a"]')).toBe(first);
		expect(container.querySelector('[data-story-id="b"]')).toBe(middle);
		expect(container.querySelector('[data-story-id="c"]')).toBe(last);

		root.unmount();
		container.remove();
	});
});
