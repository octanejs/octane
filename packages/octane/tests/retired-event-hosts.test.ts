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
import { SignalForm, Toggle } from './_fixtures/retired-event-hosts.tsrx';

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
