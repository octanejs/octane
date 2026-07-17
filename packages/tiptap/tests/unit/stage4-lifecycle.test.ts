import { Editor, ReactRenderer } from '@octanejs/tiptap';
import { PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { flushSync } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	AdvancedEditorHost,
	createAdvancedEditor,
	createSwitchingEditor,
	PendingRendererBody,
	PendingRendererHost,
	SwitchingEditorHost,
	SwitchingMenuHost,
} from '../_fixtures/stage4-lifecycle.tsrx';
import { flushEffects, mount } from '../_helpers';

function settle(): void {
	flushEffects();
	flushSync(() => {});
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

afterEach(() => {
	vi.restoreAllMocks();
});

describe('@octanejs/tiptap advanced lifecycle behavior', () => {
	it('keeps a destroyed pre-mount renderer absent after EditorContent initializes', async () => {
		const editor = new Editor({
			extensions: [StarterKit],
			content: '<p>Editor content</p>',
		});
		const renderer = new ReactRenderer(PendingRendererBody, {
			editor,
			props: { label: 'must stay gone' },
		});
		const rendererElement = renderer.element;

		renderer.destroy();
		const result = mount(PendingRendererHost as any, { editor, rendererElement });
		await settlePortals();

		expect(rendererElement.isConnected).toBe(true);
		expect(rendererElement.querySelector('[data-pending-renderer]')).toBeNull();
		expect(result.container.querySelector('[data-pending-renderer]')).toBeNull();
		expect(
			result.container.querySelector('#pending-renderer-editor .ProseMirror')?.textContent,
		).toBe('Editor content');

		result.unmount();
		flushEffects();
		editor.destroy();
	});

	it('switches custom node and mark views A to B to A without retaining inactive refs', async () => {
		const lifecycleA: string[] = [];
		const lifecycleB: string[] = [];
		const nodeRefsA: Array<HTMLElement | null> = [];
		const nodeRefsB: Array<HTMLElement | null> = [];
		const markRefsA: Array<HTMLElement | null> = [];
		const markRefsB: Array<HTMLElement | null> = [];
		const editorA = createSwitchingEditor({
			owner: 'A',
			onNodeLifecycle: (phase: string) => lifecycleA.push(`node:${phase}`),
			onNodeRef: (element: HTMLElement | null) => nodeRefsA.push(element),
			onMarkLifecycle: (phase: string) => lifecycleA.push(`mark:${phase}`),
			onMarkRef: (element: HTMLElement | null) => markRefsA.push(element),
		});
		const editorB = createSwitchingEditor({
			owner: 'B',
			onNodeLifecycle: (phase: string) => lifecycleB.push(`node:${phase}`),
			onNodeRef: (element: HTMLElement | null) => nodeRefsB.push(element),
			onMarkLifecycle: (phase: string) => lifecycleB.push(`mark:${phase}`),
			onMarkRef: (element: HTMLElement | null) => markRefsB.push(element),
		});
		const result = mount(SwitchingEditorHost as any, {
			editor: editorA,
			owner: 'A',
		});
		await settlePortals();

		expect(result.find('.switching-node-A')).toBe(nodeRefsA.at(-1));
		expect(result.find('.switching-mark-A')).toBe(markRefsA.at(-1));
		expect(result.find('#switching-node-content-A').textContent).toBe('A node content');
		expect(result.find('#switching-mark-content-A').textContent).toBe('A marked content');

		result.update(SwitchingEditorHost as any, { editor: editorB, owner: 'B' });
		await settlePortals();

		expect(nodeRefsA.at(-1)).toBeNull();
		expect(markRefsA.at(-1)).toBeNull();
		expect(lifecycleA).toContain('node:cleanup');
		expect(lifecycleA).toContain('mark:cleanup');
		expect(result.container.querySelector('.switching-node-A')).toBeNull();
		expect(result.container.querySelector('.switching-mark-A')).toBeNull();
		expect(result.find('.switching-node-B')).toBe(nodeRefsB.at(-1));
		expect(result.find('.switching-mark-B')).toBe(markRefsB.at(-1));

		result.update(SwitchingEditorHost as any, { editor: editorA, owner: 'A' });
		await settlePortals();

		expect(nodeRefsB.at(-1)).toBeNull();
		expect(markRefsB.at(-1)).toBeNull();
		expect(lifecycleB).toContain('node:cleanup');
		expect(lifecycleB).toContain('mark:cleanup');
		expect(result.find('.switching-node-A')).toBe(nodeRefsA.at(-1));
		expect(result.find('.switching-mark-A')).toBe(markRefsA.at(-1));
		result.find('#switching-node-action-A').click();
		settle();
		expect(result.find('#switching-node-action-A').textContent).toBe('clicks: 1');

		result.unmount();
		flushEffects();
		expect(nodeRefsA.at(-1)).toBeNull();
		expect(markRefsA.at(-1)).toBeNull();
		editorA.destroy();
		editorB.destroy();
	});

	it('keeps a re-registered menu attached when an old editor cleanup reaches its frame', () => {
		const editorA = new Editor({ extensions: [StarterKit], content: '<p>Alpha</p>' });
		const editorB = new Editor({ extensions: [StarterKit], content: '<p>Beta</p>' });
		const pluginKey = new PluginKey('stage4SwitchingBubbleMenu');
		const appendTo = document.createElement('div');
		const refs: Array<HTMLDivElement | null> = [];
		const action = vi.fn();
		const frameCallbacks: FrameRequestCallback[] = [];
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			frameCallbacks.push(callback);
			return frameCallbacks.length;
		});
		document.body.appendChild(appendTo);

		const props = {
			editor: editorA,
			owner: 'A',
			pluginKey,
			appendTo,
			menuRef: (element: HTMLDivElement | null) => refs.push(element),
			onAction: action,
		};
		const result = mount(SwitchingMenuHost as any, props);
		settle();

		const menuElement = refs.at(-1);
		expect(menuElement).toBeInstanceOf(HTMLDivElement);
		expect(pluginKey.get(editorA.state)).toBeDefined();
		appendTo.appendChild(menuElement as HTMLDivElement);
		expect(appendTo.contains(menuElement ?? null)).toBe(true);

		result.update(SwitchingMenuHost as any, {
			...props,
			editor: editorB,
			owner: 'B',
		});
		settle();

		expect(pluginKey.get(editorA.state)).toBeUndefined();
		expect(pluginKey.get(editorB.state)).toBeDefined();
		expect(refs.at(-1)).toBe(menuElement);
		expect(menuElement?.classList.contains('switching-menu-B')).toBe(true);
		expect(menuElement?.querySelector('[data-switching-menu-action]')?.textContent).toBe('B');
		expect(appendTo.contains(menuElement ?? null)).toBe(true);

		for (const callback of frameCallbacks.splice(0)) {
			callback(performance.now());
		}
		expect(appendTo.contains(menuElement ?? null)).toBe(true);
		menuElement
			?.querySelector<HTMLButtonElement>('[data-switching-menu-action]')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(action).toHaveBeenCalledTimes(1);

		result.unmount();
		settle();
		for (const callback of frameCallbacks.splice(0)) {
			callback(performance.now());
		}
		expect(pluginKey.get(editorB.state)).toBeUndefined();
		expect(menuElement?.isConnected).toBe(false);
		expect(refs.at(-1)).toBeNull();
		editorA.destroy();
		editorB.destroy();
		appendTo.remove();
	});

	it('publishes custom updates, live positions, functional attrs, and current storage', async () => {
		const editor = createAdvancedEditor();
		const result = mount(AdvancedEditorHost as any, { editor });
		await settlePortals();

		const initialViews = result.container.querySelectorAll('[data-advanced-view]');
		expect(initialViews).toHaveLength(2);
		expect(result.find('#advanced-content-one').textContent).toBe('one content');
		expect(result.find('#advanced-content-two').textContent).toBe('two content');
		const firstRenderer = result.find('.node-advancedNode.advanced-node-renderer');
		expect(firstRenderer.getAttribute('data-advanced-label')).toBe('one-initial');
		expect(firstRenderer.getAttribute('data-schema-label')).toBe('one-initial');

		result.find('#advanced-publish-one').click();
		await settlePortals();
		expect(result.find('#advanced-label-one').textContent).toBe('one-published');
		expect(firstRenderer.getAttribute('data-advanced-label')).toBe('one-published');
		expect(firstRenderer.getAttribute('data-schema-label')).toBe('one-published');

		result.find('#advanced-hold-one').click();
		await settlePortals();
		expect(editor.getJSON().content?.[0].attrs?.label).toBe('one-held');
		expect(result.find('#advanced-label-one').textContent).toBe('one-published');
		expect(firstRenderer.getAttribute('data-advanced-label')).toBe('one-published');

		result.find('#advanced-release-one').click();
		await settlePortals();
		expect(result.find('#advanced-label-one').textContent).toBe('one-held');
		expect(firstRenderer.getAttribute('data-advanced-label')).toBe('one-held');

		const firstPositionBefore = Number(result.find('#advanced-position-one').textContent);
		const secondPositionBefore = Number(result.find('#advanced-position-two').textContent);
		editor
			.chain()
			.insertContentAt(0, { type: 'paragraph', content: [{ type: 'text', text: 'lead' }] })
			.run();
		await settlePortals();
		expect(Number(result.find('#advanced-position-one').textContent)).toBeGreaterThan(
			firstPositionBefore,
		);
		expect(Number(result.find('#advanced-position-two').textContent)).toBeGreaterThan(
			secondPositionBefore,
		);

		editor.storage.advancedNode = { version: 'current' };
		result.find('#advanced-refresh-one').click();
		await settlePortals();
		expect(result.find('#advanced-storage-one').textContent).toBe('current');
		expect(result.find('#advanced-revision-one').textContent).toBe('1');
		expect(result.container.querySelectorAll('[data-advanced-view]')).toHaveLength(2);

		result.unmount();
		flushEffects();
		editor.destroy();
	});
});
