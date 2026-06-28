import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createEditor } from 'lexical';
import type { LexicalEditor } from 'lexical';
import { mount, flushEffects } from '../_helpers';
import { CeeProbe } from '../_fixtures/cee-probe.tsrx';

// Ported from @lexical/react/src/__tests__/unit/LexicalContentEditableElement.test.tsx
// (the two jest-axe accessibility tests are omitted — jest-axe isn't a dependency).
describe('ContentEditableElement (ported from @lexical/react)', () => {
	let editor: LexicalEditor;
	beforeEach(() => {
		editor = createEditor({ namespace: 'ContentEditableElement', onError: (e) => throwIt(e) });
	});
	function throwIt(e: unknown): never {
		throw e;
	}

	it('renders the correct ARIA attributes when editable', () => {
		const r = mount(CeeProbe as any, {
			editor,
			ceProps: { ariaLabelledBy: 'test-label', role: 'textbox' },
		});
		flushEffects();
		const el = r.find('[role="textbox"]');
		expect(el.getAttribute('aria-labelledby')).toBe('test-label');
		expect(el.getAttribute('contenteditable')).toBe('true');
		r.unmount();
	});

	it('renders kebab-case aria-labelledby (via the rest passthrough)', () => {
		const r = mount(CeeProbe as any, {
			editor,
			ceProps: { 'aria-labelledby': 'TEST', className: 'ContentEditable__root' },
		});
		flushEffects();
		const el = r.find('.ContentEditable__root');
		expect(el.getAttribute('aria-labelledby')).toBe('TEST');
		r.unmount();
	});

	it('renders the correct role for different roles', () => {
		for (const role of ['textbox', 'combobox', 'listbox', 'spinbutton']) {
			const r = mount(CeeProbe as any, { editor, ceProps: { role } });
			flushEffects();
			expect(r.find(`[role="${role}"]`).getAttribute('role')).toBe(role);
			r.unmount();
		}
	});

	it('renders aria-describedby when provided', () => {
		const r = mount(CeeProbe as any, {
			editor,
			ceProps: { ariaDescribedBy: 'test-description', role: 'textbox' },
		});
		flushEffects();
		expect(r.find('[role="textbox"]').getAttribute('aria-describedby')).toBe('test-description');
		r.unmount();
	});

	it('renders aria-expanded for role combobox', () => {
		const r = mount(CeeProbe as any, {
			editor,
			ceProps: { role: 'combobox', ariaExpanded: true },
		});
		flushEffects();
		expect(r.find('[role="combobox"]').getAttribute('aria-expanded')).toBe('true');
		r.unmount();
	});

	it('renders aria-invalid and aria-required (true)', () => {
		const r = mount(CeeProbe as any, {
			editor,
			ceProps: { ariaInvalid: 'true', ariaRequired: true, role: 'textbox' },
		});
		flushEffects();
		const el = r.find('[role="textbox"]');
		expect(el.getAttribute('aria-invalid')).toBe('true');
		expect(el.getAttribute('aria-required')).toBe('true');
		r.unmount();
	});

	it('renders aria-invalid and aria-required (false)', () => {
		const r = mount(CeeProbe as any, {
			editor,
			ceProps: { ariaInvalid: 'false', ariaRequired: false, role: 'textbox' },
		});
		flushEffects();
		const el = r.find('[role="textbox"]');
		expect(el.getAttribute('aria-invalid')).toBe('false');
		expect(el.getAttribute('aria-required')).toBe('false');
		r.unmount();
	});

	it('applies custom attributes and styles', () => {
		const r = mount(CeeProbe as any, {
			editor,
			ceProps: {
				role: 'textbox',
				'data-testid': 'test-element',
				style: { color: 'red', fontSize: '16px' },
			},
		});
		flushEffects();
		const el = r.find('[role="textbox"]') as HTMLElement;
		expect(el.getAttribute('data-testid')).toBe('test-element');
		expect(el.style.color).toBe('red');
		expect(el.style.fontSize).toBe('16px');
		r.unmount();
	});

	it('passes through custom data attributes', () => {
		const r = mount(CeeProbe as any, {
			editor,
			ceProps: {
				role: 'textbox',
				'data-testid': 'test-element',
				'data-custom-attribute': 'custom-value',
			},
		});
		flushEffects();
		const el = r.find('[role="textbox"]');
		expect(el.getAttribute('data-testid')).toBe('test-element');
		expect(el.getAttribute('data-custom-attribute')).toBe('custom-value');
		r.unmount();
	});

	it('registers and cleans up the root element', () => {
		let rootElement: HTMLElement | null = null;
		editor.setRootElement = vi.fn((element: any) => {
			rootElement = element;
		}) as any;

		const r = mount(CeeProbe as any, { editor, ceProps: { role: 'textbox' } });
		flushEffects();
		const el = r.find('[role="textbox"]');
		expect(rootElement).toBe(el);

		r.unmount();
		flushEffects();
		expect(rootElement).toBeNull();
	});

	it('renders the spellcheck attribute for different values', () => {
		for (const spellCheck of [true, false]) {
			const r = mount(CeeProbe as any, { editor, ceProps: { spellCheck, role: 'textbox' } });
			flushEffects();
			expect(r.find('[role="textbox"]').getAttribute('spellcheck')).toBe(String(spellCheck));
			r.unmount();
		}
	});
});
