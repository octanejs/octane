import type { Editor } from '@tiptap/core';
import { flushSync } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CustomViewsEditor } from '../_fixtures/custom-views.tsrx';
import { flushEffects, mount, nextPaint } from '../_helpers';

function settle(): void {
	flushEffects();
	flushSync(() => {});
	flushEffects();
}

async function settlePortals(): Promise<void> {
	await Promise.resolve();
	settle();
	await Promise.resolve();
	settle();
}

function findMarkedRange(editor: Editor): { from: number; to: number } {
	let range: { from: number; to: number } | undefined;

	editor.state.doc.descendants((node, position) => {
		if (node.isText && node.marks.some((mark) => mark.type.name === 'badgeMark')) {
			range = { from: position, to: position + node.nodeSize };
		}
	});

	if (!range) {
		throw new Error('Expected the fixture to contain badge-marked text.');
	}

	return range;
}

afterEach(() => {
	vi.useRealTimers();
});

describe('@octanejs/tiptap custom views', () => {
	it('updates and destroys a public ReactRenderer while preserving context, state, effects, and refs', async () => {
		let editor: Editor | undefined;
		let renderer: any;
		const directLifecycle: string[] = [];
		const fixtureProps = {
			theme: 'day',
			onEditor: (currentEditor: Editor) => {
				editor = currentEditor;
			},
			onRenderer: (currentRenderer: any) => {
				renderer = currentRenderer;
			},
			onDirectLifecycle: (phase: string) => directLifecycle.push(phase),
			onNodeLifecycle: () => {},
			onNodeRef: () => {},
			onMarkLifecycle: () => {},
			onMarkRef: () => {},
		};
		const result = mount(CustomViewsEditor as any, fixtureProps);
		await settlePortals();

		expect(editor).toBeTruthy();
		result.find('[data-create-renderer]').click();
		await settlePortals();

		expect(renderer).toBeTruthy();
		expect(renderer.element.tagName).toBe('ASIDE');
		expect(renderer.element.classList.contains('react-renderer')).toBe(true);
		expect(renderer.element.classList.contains('direct-renderer')).toBe(true);
		expect(renderer.element.classList.contains('custom-shell')).toBe(true);
		expect(renderer.element.parentElement).toBe(result.find('[data-direct-renderer-host]'));
		expect(result.find('[data-direct-theme]').textContent).toBe('day');
		expect(result.find('[data-direct-label]').textContent).toBe('initial');
		expect(directLifecycle).toEqual(['mount']);

		const widget = result.find('[data-direct-widget]');
		expect(renderer.ref).toBe(widget);
		result.find('[data-direct-increment]').click();
		settle();
		expect(result.find('[data-direct-increment]').textContent).toBe('renderer clicks: 1');

		renderer.updateProps({ label: 'updated' });
		await settlePortals();
		expect(result.find('[data-direct-widget]')).toBe(widget);
		expect(result.find('[data-direct-label]').textContent).toBe('updated');
		expect(result.find('[data-direct-increment]').textContent).toBe('renderer clicks: 1');
		expect(directLifecycle).toEqual(['mount']);

		renderer.updateAttributes({ 'data-owned-by': 'consumer' });
		expect(renderer.element.getAttribute('data-owned-by')).toBe('consumer');

		result.update(CustomViewsEditor as any, { ...fixtureProps, theme: 'night' });
		await settlePortals();
		expect(result.find('[data-direct-widget]')).toBe(widget);
		expect(result.find('[data-direct-theme]').textContent).toBe('night');
		expect(result.find('[data-direct-increment]').textContent).toBe('renderer clicks: 1');

		const rendererElement = renderer.element;
		renderer.destroy();
		await settlePortals();
		expect(directLifecycle).toEqual(['mount', 'cleanup']);
		expect(renderer.ref).toBe(null);
		expect(rendererElement.isConnected).toBe(false);
		expect(result.container.querySelector('[data-direct-widget]')).toBe(null);

		result.unmount();
		flushEffects();
		editor?.destroy();
	});

	it('keeps non-leaf node and mark content live across updates, then cleans both views up', async () => {
		let editor: Editor | undefined;
		const nodeLifecycle: string[] = [];
		const markLifecycle: string[] = [];
		const nodeRefs: Array<HTMLElement | null> = [];
		const markRefs: Array<HTMLElement | null> = [];
		const fixtureProps = {
			theme: 'day',
			onEditor: (currentEditor: Editor) => {
				editor = currentEditor;
			},
			onRenderer: () => {},
			onDirectLifecycle: () => {},
			onNodeLifecycle: (phase: string) => nodeLifecycle.push(phase),
			onNodeRef: (element: HTMLElement | null) => nodeRefs.push(element),
			onMarkLifecycle: (phase: string) => markLifecycle.push(phase),
			onMarkRef: (element: HTMLElement | null) => markRefs.push(element),
		};
		const result = mount(CustomViewsEditor as any, fixtureProps);
		await settlePortals();

		if (!editor) {
			throw new Error('Expected useEditor to create the custom-view editor.');
		}

		const nodeRenderer = result.find('.node-panelNode.panel-node-renderer');
		const nodeView = result.find('[data-panel-node-view]');
		const nodeContent = result.find('[data-node-view-content]');
		const markRenderer = result.find('.mark-badgeMark.badge-mark-renderer');
		const markView = result.find('[data-badge-mark-view]');
		const markContent = result.find('[data-mark-view-content]');

		expect(nodeRenderer.tagName).toBe('SECTION');
		expect(nodeRenderer.getAttribute('data-panel-label')).toBe('initial');
		expect(nodeRenderer.getAttribute('data-panel-shell')).toBe('true');
		expect(nodeView.tagName).toBe('ARTICLE');
		expect(nodeView.hasAttribute('data-node-view-wrapper')).toBe(true);
		expect(nodeContent.tagName).toBe('SECTION');
		expect(nodeContent.textContent).toBe('Editable panel content');
		expect(nodeRefs.at(-1)).toBe(nodeView);
		expect(nodeLifecycle).toEqual(['mount']);

		expect(markRenderer.getAttribute('data-badge-shell')).toBe('true');
		expect(markView.classList.contains('badge-mark-view')).toBe(true);
		expect(markContent.tagName).toBe('STRONG');
		expect(markContent.textContent).toBe('Marked text');
		expect(markRefs.at(-1)).toBe(markView);
		expect(markLifecycle).toEqual(['mount']);
		expect(result.find('[data-node-theme]').textContent).toBe('day');
		expect(result.find('[data-mark-theme]').textContent).toBe('day');

		result.find('[data-node-increment]').click();
		settle();
		expect(result.find('[data-node-increment]').textContent).toBe('node clicks: 1');

		result.find('[data-node-update]').click();
		await settlePortals();
		expect(result.find('.node-panelNode.panel-node-renderer')).toBe(nodeRenderer);
		expect(result.find('[data-panel-node-view]')).toBe(nodeView);
		expect(result.find('[data-node-view-content]')).toBe(nodeContent);
		expect(nodeRenderer.getAttribute('data-panel-label')).toBe('updated');
		expect(result.find('[data-node-label]').textContent).toBe('updated');
		expect(result.find('[data-node-increment]').textContent).toBe('node clicks: 1');
		expect(nodeLifecycle).toEqual(['mount']);

		editor.commands.setNodeSelection(0);
		await nextPaint();
		await settlePortals();
		expect(nodeRenderer.classList.contains('ProseMirror-selectednode')).toBe(true);
		expect(result.find('[data-node-selected]').textContent).toBe('selected');

		result.update(CustomViewsEditor as any, { ...fixtureProps, theme: 'night' });
		await settlePortals();
		expect(result.find('[data-panel-node-view]')).toBe(nodeView);
		expect(result.find('[data-badge-mark-view]')).toBe(markView);
		expect(result.find('[data-node-theme]').textContent).toBe('night');
		expect(result.find('[data-mark-theme]').textContent).toBe('night');
		expect(result.find('[data-node-increment]').textContent).toBe('node clicks: 1');

		const markedRange = findMarkedRange(editor);
		editor.chain().setTextSelection(markedRange).unsetMark('badgeMark').run();
		await settlePortals();
		expect(result.container.querySelector('[data-badge-mark-view]')).toBe(null);
		expect(result.container.querySelector('[data-mark-view-content]')).toBe(null);
		expect(editor.getText()).toContain('Marked text');
		expect(markLifecycle).toEqual(['mount', 'cleanup']);
		expect(markRefs.at(-1)).toBe(null);

		result.find('[data-node-delete]').click();
		await settlePortals();
		expect(result.container.querySelector('[data-panel-node-view]')).toBe(null);
		expect(result.container.querySelector('[data-node-view-content]')).toBe(null);
		expect(editor.getText()).toContain('Marked text');
		expect(nodeLifecycle).toEqual(['mount', 'cleanup']);
		expect(nodeRefs.at(-1)).toBe(null);

		result.unmount();
		flushEffects();
		editor.destroy();
	});
});
