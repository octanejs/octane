/**
 * Adapted from packages/tiptap/upstream/src/EditorContent.spec.ts.
 */
import { createElement } from 'octane';
import { describe, expect, it, vi } from 'vitest';

import { createContentComponent } from '@octanejs/tiptap';
import type { ReactRenderer } from '@octanejs/tiptap';

function createRenderer(id: string) {
	return {
		reactElement: createElement('span', null, id),
		element: document.createElement('div'),
	} as ReactRenderer;
}

describe('createContentComponent', function () {
	// Per upstream/src/EditorContent.spec.ts:14.
	it('batches synchronous renderer change notifications', async function () {
		const contentComponent = createContentComponent();
		const subscriber = vi.fn();

		contentComponent.subscribe(subscriber);

		contentComponent.setRenderer('first', createRenderer('first'));
		contentComponent.setRenderer('second', createRenderer('second'));

		expect(Object.keys(contentComponent.getSnapshot())).toEqual(['first', 'second']);
		expect(subscriber).not.toHaveBeenCalled();

		await Promise.resolve();

		expect(subscriber).toHaveBeenCalledTimes(1);

		contentComponent.removeRenderer('first');
		contentComponent.removeRenderer('second');

		expect(Object.keys(contentComponent.getSnapshot())).toEqual([]);

		await Promise.resolve();

		expect(subscriber).toHaveBeenCalledTimes(2);
	});
});
