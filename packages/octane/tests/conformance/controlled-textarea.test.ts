import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '../_helpers';
import { compile } from '../../src/compiler/compile.js';
import { ControlledTextarea, DefaultTextarea } from './_fixtures/controlled-forms.tsrx';

// ============================================================================
// Controlled <textarea> — ports of ReactDOMTextarea-test.js (React v19.2.7).
// The value prop OWNS the content: the client writes defaultValue (the text
// content) + the live value; children alongside value/defaultValue are a
// COMPILE ERROR in `.tsrx` (React throws for defaultValue+children at
// runtime; octane can reject at build time).
// ============================================================================

afterEach(() => {
	vi.restoreAllMocks();
});

function type(el: HTMLTextAreaElement, text: string): void {
	el.value = text;
	el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('conformance: controlled <textarea>', () => {
	// Per ReactDOMTextarea-test.js:141 ('should display `value` of number 0').
	it('mount writes the content and the live value', () => {
		const r = mount(ControlledTextarea, { value: 'hello', onInput: () => {} });
		const el = r.find('#ta') as HTMLTextAreaElement;
		expect(el.value).toBe('hello');
		expect(el.textContent).toBe('hello'); // defaultValue = text content
		r.update(ControlledTextarea, { value: 0, onInput: () => {} });
		expect(el.value).toBe('0');
		r.unmount();
	});

	// Per ReactControlledComponent-test.js — the restore covers textareas.
	it('reverts an unhandled edit', () => {
		const r = mount(ControlledTextarea, { value: 'locked', onInput: () => {} });
		const el = r.find('#ta') as HTMLTextAreaElement;
		type(el, 'lockedX');
		expect(el.value).toBe('locked');
		r.unmount();
	});

	// Per ReactDOMTextarea-test.js:186 ('should allow setting `defaultValue`').
	it('defaultValue seeds; typing sticks; a changed default only re-seeds a clean control', () => {
		const r = mount(DefaultTextarea, { dv: 'seed' });
		const el = r.find('#dta') as HTMLTextAreaElement;
		expect(el.value).toBe('seed');
		type(el, 'typed');
		expect(el.value).toBe('typed'); // uncontrolled — sticks
		r.update(DefaultTextarea, { dv: 'other' });
		expect(el.value).toBe('typed'); // dirty control keeps the user's text
		expect(el.defaultValue).toBe('other'); // the default itself re-synced
		r.unmount();
	});
});

describe('conformance: <textarea> children rejection (compile-time)', () => {
	// Per ReactDOMTextarea-test.js:305 ('should throw when both children and
	// defaultValue are passed') — octane rejects at COMPILE time, for value
	// and defaultValue alike, on both the client and server emit paths.
	const src = (attr: string) =>
		`export function T(props) @{\n\t<textarea ${attr}>{'child text'}</textarea>\n}\n`;

	it('rejects children + value / defaultValue in both modes', () => {
		for (const attr of ['value={props.v}', 'defaultValue="x"']) {
			for (const mode of ['client', 'server'] as const) {
				expect(() => compile(src(attr), 'T.tsrx', { mode })).toThrow(
					/must not have children when it uses `value` or `defaultValue`/,
				);
			}
		}
	});

	it('keeps plain textarea text children (native defaultValue semantics)', () => {
		expect(() =>
			compile(`export function T() @{\n\t<textarea>{'fine'}</textarea>\n}\n`, 'T.tsrx', {
				mode: 'client',
			}),
		).not.toThrow();
	});
});
