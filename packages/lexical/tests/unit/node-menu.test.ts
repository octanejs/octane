import { describe, it, expect, vi } from 'vitest';
import { createPortal } from 'octane';
import { mount, flushEffects } from '../_helpers';
import {
	MenuOption,
	type MenuRenderFn,
	type MenuResolution,
} from '@octanejs/lexical/shared/menuShared';
import { MenuOption as PluginMenuOption } from '@octanejs/lexical/LexicalNodeMenuPlugin';
import { NodeMenuEditor, CustomNodeMenuBody } from '../_fixtures/node-menu-editor.tsrx';

async function settle() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		flushEffects();
	}
}

class TestNodeMenuOption extends MenuOption {
	title: string;
	constructor(title: string) {
		super(title);
		this.title = title;
	}
}

function makeOptions() {
	return [
		new TestNodeMenuOption('Edit'),
		new TestNodeMenuOption('Delete'),
		new TestNodeMenuOption('Copy'),
	];
}

const customMenuRenderFn: MenuRenderFn<TestNodeMenuOption> = (anchorElementRef, itemProps) => {
	return anchorElementRef.current && itemProps.options.length
		? createPortal(CustomNodeMenuBody as any, anchorElementRef.current, { itemProps })
		: null;
};

// Ported from @lexical/react/src/__tests__/unit/LexicalNodeMenuPlugin.test.tsx.
describe('LexicalNodeMenuPlugin', () => {
	describe('exports', () => {
		it('should export MenuRenderFn type', () => {
			const fn: MenuRenderFn<TestNodeMenuOption> = () => null;
			expect(fn).toBeDefined();
		});

		it('should export MenuOption class', () => {
			const option = new PluginMenuOption('key');
			expect(option.key).toBe('key');
		});

		it('should export MenuResolution type', () => {
			const res: MenuResolution = {
				getRect: () =>
					({
						bottom: 0,
						height: 0,
						left: 0,
						right: 0,
						top: 0,
						width: 0,
						x: 0,
						y: 0,
					}) as DOMRect,
			};
			expect(res.getRect).toBeDefined();
		});
	});

	describe('with menuRenderFn (backward compatibility)', () => {
		it('should render without errors when menuRenderFn is provided', async () => {
			const r = mount(NodeMenuEditor as any, {
				nodeKey: null,
				options: makeOptions(),
				menuRenderFn: customMenuRenderFn,
			});
			await settle();
			// With nodeKey=null the menu should not be open.
			expect(r.container.querySelector('[contenteditable]')).not.toBeNull();
			r.unmount();
		});

		it('should accept menuRenderFn as an optional prop', async () => {
			const r = mount(NodeMenuEditor as any, {
				nodeKey: null,
				options: [],
				menuRenderFn: customMenuRenderFn,
			});
			await settle();
			expect(r.container.querySelector('[contenteditable]')).not.toBeNull();
			r.unmount();
		});
	});

	describe('without menuRenderFn (new default rendering)', () => {
		it('should render without errors when menuRenderFn is omitted', async () => {
			const r = mount(NodeMenuEditor as any, {
				nodeKey: null,
				options: makeOptions(),
			});
			await settle();
			expect(r.container.querySelector('[contenteditable]')).not.toBeNull();
			r.unmount();
		});

		it('should accept props without menuRenderFn', async () => {
			const r = mount(NodeMenuEditor as any, {
				nodeKey: null,
				options: [],
			});
			await settle();
			expect(r.container.querySelector('[contenteditable]')).not.toBeNull();
			r.unmount();
		});
	});
});
