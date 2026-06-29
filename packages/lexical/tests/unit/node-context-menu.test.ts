import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../_helpers';
import { ContextMenuEditor } from '../_fixtures/context-menu-editor.tsrx';
import {
	NodeContextMenuOption,
	NodeContextMenuSeparator,
} from '@octanejs/lexical/LexicalNodeContextMenuPlugin';

// computePosition + floating-ui effects resolve on microtask/timer chains that
// nextPaint() doesn't pump — drain real timers a few times.
async function settle() {
	for (let i = 0; i < 8; i++) {
		await new Promise((r) => setTimeout(r, 0));
		flushEffects();
	}
}

describe('@octanejs/lexical — NodeContextMenuPlugin (built on @octanejs/floating-ui)', () => {
	it('opens on right-click, renders items + separator, selects via click, then closes', async () => {
		const selected: string[] = [];
		const items = [
			new NodeContextMenuOption('Cut', { $onSelect: () => selected.push('Cut') }),
			new NodeContextMenuOption('Copy', { $onSelect: () => selected.push('Copy') }),
			new NodeContextMenuSeparator({}),
			new NodeContextMenuOption('Paste', { $onSelect: () => selected.push('Paste') }),
		];
		let editor: any;
		const r = mount(ContextMenuEditor as any, { items, onEditor: (ed: any) => (editor = ed) });
		await settle();
		expect(editor).toBeTruthy();

		const root = r.container.querySelector('[contenteditable]') as HTMLElement;
		expect(root).toBeTruthy();
		expect(document.querySelector('.ctx-menu')).toBeNull(); // closed initially

		// Right-click opens the menu (portaled to body).
		root.dispatchEvent(
			new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }),
		);
		await settle();

		const menu = document.querySelector('.ctx-menu');
		expect(menu).toBeTruthy();
		expect(menu!.getAttribute('role')).toBe('menu');
		const buttons = menu!.querySelectorAll('button');
		expect(buttons.length).toBe(3); // Cut, Copy, Paste
		expect(buttons[0].textContent).toContain('Cut');
		expect(menu!.querySelectorAll('hr.ctx-sep').length).toBe(1);

		// Click "Copy" → runs $onSelect inside an editor.update + closes the menu.
		(buttons[1] as HTMLElement).click();
		await settle();
		expect(selected).toEqual(['Copy']);
		expect(document.querySelector('.ctx-menu')).toBeNull();

		r.unmount();
	});

	it('dismisses on Escape', async () => {
		const items = [new NodeContextMenuOption('Cut', { $onSelect: () => {} })];
		let editor: any;
		const r = mount(ContextMenuEditor as any, { items, onEditor: (ed: any) => (editor = ed) });
		await settle();
		const root = r.container.querySelector('[contenteditable]') as HTMLElement;
		root.dispatchEvent(
			new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
		);
		await settle();
		expect(document.querySelector('.ctx-menu')).toBeTruthy();

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(document.querySelector('.ctx-menu')).toBeNull();
		r.unmount();
	});
});
