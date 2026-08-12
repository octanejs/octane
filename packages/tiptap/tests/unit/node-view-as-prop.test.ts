/**
 * Adapted divergence: NodeViewWrapper consumes its `as` prop when selecting the
 * host tag; @tiptap/react 3.28.0 also forwards that prop as an invalid DOM attribute.
 */
import type { Editor } from '@tiptap/core';
import { flushSync } from 'octane';
import { describe, expect, it } from 'vitest';

import { CustomViewsEditor } from '../_fixtures/custom-views.tsrx';
import { flushEffects, mount } from '../_helpers';

async function settlePortals(): Promise<void> {
	await Promise.resolve();
	flushEffects();
	flushSync(function () {});
	flushEffects();
	await Promise.resolve();
	flushEffects();
	flushSync(function () {});
	flushEffects();
}

describe('@octanejs/tiptap NodeViewWrapper as prop', function () {
	// Extra conformance; required divergence marker is on src/NodeViewWrapper.ts.
	it('consumes the node view as prop without forwarding it to the DOM', async function () {
		let editor: Editor | undefined;
		const result = mount(CustomViewsEditor as any, {
			theme: 'day',
			onEditor: function onEditor(currentEditor: Editor) {
				editor = currentEditor;
			},
			onRenderer: function onRenderer() {},
			onDirectLifecycle: function onDirectLifecycle() {},
			onNodeLifecycle: function onNodeLifecycle() {},
			onNodeRef: function onNodeRef() {},
			onMarkLifecycle: function onMarkLifecycle() {},
			onMarkRef: function onMarkRef() {},
		});
		await settlePortals();

		const nodeView = result.find('[data-panel-node-view]');
		expect(nodeView.tagName).toBe('ARTICLE');
		expect(nodeView.hasAttribute('as')).toBe(false);

		result.unmount();
		flushEffects();
		editor?.destroy();
	});
});
