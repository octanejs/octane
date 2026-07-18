import { describe, expect, it } from 'vitest';
import * as ServerRT from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { loadServerFixture } from './_server-fixture.js';
import { mount } from './_helpers.js';
import { NestedStoryFeed } from './_fixtures/nested-template-directives.tsrx';

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
