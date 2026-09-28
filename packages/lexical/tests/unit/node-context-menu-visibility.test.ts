// Ported from @lexical/react/src/__tests__/unit/LexicalNodeContextMenuPlugin.test.tsx (0.51.0).
// All 3 upstream cases are ported, rendered through the existing
// ContextMenuEditor fixture (RichTextPlugin + NodeContextMenuPlugin, menu class
// `ctx-menu`).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushEffects } from '../_helpers';
import { ContextMenuEditor } from '../_fixtures/context-menu-editor.tsrx';
import {
	NodeContextMenuOption,
	NodeContextMenuSeparator,
} from '@octanejs/lexical/LexicalNodeContextMenuPlugin';

const MENU_CLASS = 'ctx-menu';

// computePosition + floating-ui effects resolve on microtask/timer chains that
// flushEffects() doesn't pump, so drain real timers a few times (as
// node-context-menu.test.ts).
async function settle() {
	for (let i = 0; i < 8; i++) {
		await new Promise((r) => setTimeout(r, 0));
		flushEffects();
	}
}

describe('NodeContextMenuPlugin', () => {
	let rendered: ReturnType<typeof mount> | null = null;

	afterEach(() => {
		if (rendered !== null) {
			rendered.unmount();
			rendered = null;
		}
	});

	async function renderPlugin(showOn: boolean, withSeparator = false): Promise<void> {
		const items = [
			...(withSeparator ? [new NodeContextMenuSeparator()] : []),
			new NodeContextMenuOption('Do a thing', {
				$onSelect: vi.fn(),
				$showOn: () => showOn,
			}),
		];
		rendered = mount(ContextMenuEditor as any, { items, onEditor: () => {} });
		await settle();
	}

	async function rightClick(): Promise<MouseEvent> {
		const rootElement = rendered!.container.querySelector(
			'[contenteditable="true"]',
		) as HTMLElement;
		expect(rootElement).not.toBeNull();
		const event = new MouseEvent('contextmenu', {
			bubbles: true,
			cancelable: true,
		});
		rootElement.dispatchEvent(event);
		await settle();
		return event;
	}

	function isMenuOpen(): boolean {
		return document.querySelector(`.${MENU_CLASS}`) !== null;
	}

	it('leaves the native context menu alone when no item is shown', async () => {
		await renderPlugin(false);

		const event = await rightClick();
		expect(event.defaultPrevented).toBe(false);
		expect(isMenuOpen()).toBe(false);
	});

	it('opens and replaces the native context menu when an item is shown', async () => {
		await renderPlugin(true);

		const event = await rightClick();
		expect(event.defaultPrevented).toBe(true);
		expect(isMenuOpen()).toBe(true);
	});

	it('leaves the native context menu alone when only separators remain', async () => {
		// Separators have no $showOn, so they survive the filter even when every
		// option is hidden: a menu of nothing but dividers is still no menu.
		await renderPlugin(false, true);

		const event = await rightClick();
		expect(event.defaultPrevented).toBe(false);
		expect(isMenuOpen()).toBe(false);
	});
});
