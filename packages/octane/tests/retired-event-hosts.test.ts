// Issue #1472: teardown disposes a Block before its DOM leaves the document, so a
// focus change during deletion dispatches focusout at a host whose component is
// already unmounted. That new dispatch must not start the retired handler (its
// signal write reported ScopeDisposedError), while live ancestors still receive
// the native event. tests/browser/retired-event-hosts covers Chromium's
// synchronous blur during removal itself; jsdom only blurs on an explicit focus
// change, which a dialog-style deletion cleanup provides.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync } from '../src/index.js';
import { mount } from './_helpers.js';
import {
	DialogToggle,
	EditableRows,
	PortalToggle,
	SiblingToggle,
	SignalForm,
	TemplatePortalToggle,
	Toggle,
} from './_fixtures/retired-event-hosts.tsrx';

let restore: HTMLButtonElement;
let errors: unknown[];
const recordError = (event: ErrorEvent) => {
	errors.push(event.error);
	event.preventDefault();
};

beforeEach(() => {
	errors = [];
	restore = document.createElement('button');
	document.body.append(restore);
	window.addEventListener('error', recordError);
});

afterEach(() => {
	window.removeEventListener('error', recordError);
	restore.remove();
});

describe('focus moved during deletion (#1472)', () => {
	it('still runs a mounted handler and its signal write', () => {
		const seen: string[] = [];
		const r = mount(SignalForm, { observe: (entry: string) => seen.push(entry), restore });
		(r.find('input') as HTMLInputElement).focus();
		restore.focus();
		expect(seen).toEqual(['blur', 'write']);
		expect(errors).toEqual([]);
		r.unmount();
	});

	it('does not start a handler on an unmounted root', () => {
		const seen: string[] = [];
		const r = mount(SignalForm, { observe: (entry: string) => seen.push(entry), restore });
		(r.find('input') as HTMLInputElement).focus();
		r.unmount();
		expect(document.activeElement).toBe(restore);
		expect(seen).toEqual([]);
		expect(errors).toEqual([]);
	});

	it('skips the disposed branch and keeps its live ancestor', () => {
		const seen: string[] = [];
		const observe = (entry: string) => seen.push(entry);
		const r = mount(Toggle, { observe, restore, show: true });
		(r.find('input') as HTMLInputElement).focus();
		flushSync(() => r.root.render(Toggle, { observe, restore, show: false }));
		expect(document.activeElement).toBe(restore);
		expect(r.container.querySelector('form')).toBeNull();
		expect(seen).toEqual(['parent']);
		expect(errors).toEqual([]);
		r.unmount();
	});
});

// Deletion cleanups run parent first, so a cleanup can move focus while the
// components below it are still mounted. Every host the deletion removes is
// already retired by then, whichever component owns it.
describe('deletion cleanup moves focus before its children unmount (#1472)', () => {
	it("skips a child component's handler when the deleted dialog restores focus", () => {
		const seen: string[] = [];
		const observe = (entry: string) => seen.push(entry);
		const r = mount(DialogToggle, { observe, restore, show: true });
		(r.find('input') as HTMLInputElement).focus();
		flushSync(() => r.root.render(DialogToggle, { observe, restore, show: false }));
		expect(document.activeElement).toBe(restore);
		expect(r.container.querySelector('form')).toBeNull();
		expect(seen).toEqual(['parent']);
		expect(errors).toEqual([]);
		r.unmount();
	});

	it('skips a value-hole input in a removed row when an earlier sibling restores focus', () => {
		const seen: string[] = [];
		const observe = (entry: string) => seen.push(entry);
		const props = (rows: number[]) => ({ observe, restore, rows, editing: 1 });
		const r = mount(EditableRows, props([1, 2]));
		(r.find('input') as HTMLInputElement).focus();
		flushSync(() => r.root.render(EditableRows, props([2])));
		expect(document.activeElement).toBe(restore);
		expect(r.container.querySelectorAll('div').length).toBe(1);
		expect(seen).toEqual(['parent']);
		expect(errors).toEqual([]);
		r.unmount();
	});

	for (const [shape, Fixture] of [
		['returned', PortalToggle],
		['template', TemplatePortalToggle],
	] as const) {
		it(`skips a ${shape} portal's child handler when its dialog restores focus`, () => {
			const target = document.createElement('div');
			document.body.append(target);
			const seen: string[] = [];
			const observe = (entry: string) => seen.push(entry);
			const r = mount(Fixture, { observe, restore, show: true, target });
			(target.querySelector('input') as HTMLInputElement).focus();
			flushSync(() => r.root.render(Fixture, { observe, restore, show: false, target }));
			expect(document.activeElement).toBe(restore);
			expect(target.querySelector('form')).toBeNull();
			// The portal's logical parent is the live section.
			expect(seen).toEqual(['parent']);
			expect(errors).toEqual([]);
			r.unmount();
			target.remove();
		});
	}

	it("keeps a live sibling's handler when a deletion cleanup moves focus off it", () => {
		const seen: string[] = [];
		const observe = (entry: string) => seen.push(entry);
		const r = mount(SiblingToggle, { observe, restore, show: true });
		const sibling = r.find('.sibling') as HTMLInputElement;
		sibling.focus();
		flushSync(() => r.root.render(SiblingToggle, { observe, restore, show: false }));
		expect(seen).toEqual(['sibling', 'parent']);
		// Still in the deletion's task: the sibling's next blur is delivered too.
		sibling.focus();
		restore.focus();
		expect(seen).toEqual(['sibling', 'parent', 'sibling', 'parent']);
		expect(errors).toEqual([]);
		r.unmount();
	});
});
