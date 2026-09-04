import { describe, expect, it } from 'vitest';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { loadServerFixture } from './_server-fixture';
import {
	AssignedStyleRef,
	BareIfReturnStyleRef,
	CallbackStyleRef,
	CurrentStyleRef,
	EarlyReturnScopeStyleRef,
	IdentifierCallbackStyleRef,
	NestedReturnStyleRef,
	ReturnedStyleRef,
	SwitchReturnStyleRef,
	SwitchScopeStyleRef,
	ValueStyleRef,
} from './_fixtures/style-ref.tsrx';

const FIXTURE = 'packages/octane/tests/_fixtures/style-ref.tsrx';
const server = loadServerFixture(FIXTURE);

function scopeHash(element: Element): string {
	const hash = Array.from(element.classList).find(function (name) {
		return name.startsWith('tsrx-');
	});
	if (!hash) throw new Error('expected a scoped CSS hash class');
	return hash;
}

function expectClassMap(element: HTMLElement, color: string): string {
	const hash = scopeHash(element);
	const text = element.textContent || '';
	expect(text).not.toBe('missing');
	expect(text).toContain(hash);
	expect(text).toContain('card');
	expect(element.classList.contains('card')).toBe(true);
	expect(element.classList.contains(hash)).toBe(true);
	expect(getComputedStyle(element).color).toBe(color);
	return text;
}

describe('style block ref class maps', function () {
	it('assigns the class map to a let binding', function () {
		const r = mount(AssignedStyleRef as any);
		const text = expectClassMap(r.find('#assigned') as HTMLElement, 'rgb(9, 8, 7)');
		expect(r.container.querySelector('style')).toBeNull();
		expect(text).toMatch(/tsrx-[a-z0-9]+ card/i);
		r.unmount();
	});

	it('calls a callback ref with the class map', function () {
		const r = mount(CallbackStyleRef as any);
		expectClassMap(r.find('#callback') as HTMLElement, 'rgb(6, 5, 4)');
		r.unmount();
	});

	it('calls an identifier callback ref with the class map', function () {
		const r = mount(IdentifierCallbackStyleRef as any);
		expectClassMap(r.find('#id-callback') as HTMLElement, 'rgb(14, 15, 16)');
		r.unmount();
	});

	it('writes the class map onto a current ref object', function () {
		const r = mount(CurrentStyleRef as any);
		expectClassMap(r.find('#current') as HTMLElement, 'rgb(3, 2, 1)');
		r.unmount();
	});

	it('writes the class map onto a value ref object', function () {
		const r = mount(ValueStyleRef as any);
		expectClassMap(r.find('#value') as HTMLElement, 'rgb(11, 12, 13)');
		r.unmount();
	});

	it('assigns the class map in a returned template', function () {
		const r = mount(ReturnedStyleRef as any);
		expectClassMap(r.find('#returned') as HTMLElement, 'rgb(21, 22, 23)');
		r.unmount();
	});

	it('assigns the class map during SSR of a statement-list scope', function () {
		const { html, css } = ServerRT.renderToString(server.AssignedStyleRef);
		expect(html).toContain('id="assigned"');
		expect(html).not.toContain('missing');
		expect(html).toMatch(/tsrx-[a-z0-9]+ card/i);
		expect(css).toMatch(/\.card\.tsrx-[a-z0-9]+/i);
		expect(html).not.toContain('<style');
	});

	it('assigns the class map during SSR of a returned template', function () {
		const { html, css } = ServerRT.renderToString(server.ReturnedStyleRef);
		expect(html).toContain('id="returned"');
		expect(html).not.toContain('missing');
		expect(html).toMatch(/tsrx-[a-z0-9]+ card/i);
		expect(css).toMatch(/\.card\.tsrx-[a-z0-9]+/i);
	});

	it('assigns the class map before nested if/else returns', function () {
		const alt = mount(NestedReturnStyleRef as any, { alt: true });
		expectClassMap(alt.find('#nested-alt') as HTMLElement, 'rgb(41, 42, 43)');
		alt.unmount();
		const main = mount(NestedReturnStyleRef as any, { alt: false });
		expectClassMap(main.find('#nested-main') as HTMLElement, 'rgb(41, 42, 43)');
		main.unmount();
	});

	it('assigns the class map before a braceless if-return', function () {
		const alt = mount(BareIfReturnStyleRef as any, { alt: true });
		expectClassMap(alt.find('#bare-alt') as HTMLElement, 'rgb(61, 62, 63)');
		alt.unmount();
		const main = mount(BareIfReturnStyleRef as any, { alt: false });
		expectClassMap(main.find('#bare-main') as HTMLElement, 'rgb(61, 62, 63)');
		main.unmount();
	});

	it('assigns the class map before an early return in a statement-list scope', function () {
		const alt = mount(EarlyReturnScopeStyleRef as any, { alt: true });
		const early = alt.find('#early-alt') as HTMLElement;
		const text = early.textContent || '';
		// `@{ }` only scopes `body.render`, so the early-return host is not
		// hash-stamped. The class map must still be written before that return.
		expect(text).not.toBe('missing');
		expect(text).toMatch(/tsrx-[a-z0-9]+ card/i);
		expect(early.classList.contains('card')).toBe(true);
		alt.unmount();
		const main = mount(EarlyReturnScopeStyleRef as any, { alt: false });
		expectClassMap(main.find('#early-main') as HTMLElement, 'rgb(31, 32, 33)');
		main.unmount();
	});

	it('assigns the class map during SSR of a nested if/else return', function () {
		const alt = ServerRT.renderToString(server.NestedReturnStyleRef, { alt: true });
		expect(alt.html).toContain('id="nested-alt"');
		expect(alt.html).not.toContain('missing');
		expect(alt.html).toMatch(/tsrx-[a-z0-9]+ card/i);
		expect(alt.css).toMatch(/\.card\.tsrx-[a-z0-9]+/i);
		const main = ServerRT.renderToString(server.NestedReturnStyleRef, { alt: false });
		expect(main.html).toContain('id="nested-main"');
		expect(main.html).not.toContain('missing');
		expect(main.html).toMatch(/tsrx-[a-z0-9]+ card/i);
	});

	it('assigns the class map before unbraced switch returns', function () {
		const a = mount(SwitchReturnStyleRef as any, { which: 'a' });
		expectClassMap(a.find('#switch-a') as HTMLElement, 'rgb(71, 72, 73)');
		a.unmount();
		const b = mount(SwitchReturnStyleRef as any, { which: 'b' });
		const text = (b.find('#switch-b') as HTMLElement).textContent || '';
		expect(text).not.toBe('missing');
		expect(text).toMatch(/tsrx-[a-z0-9]+ card/i);
		b.unmount();
	});

	it('assigns the class map for a switch return and fall-through in one scope', function () {
		const a = mount(SwitchScopeStyleRef as any, { which: 'a' });
		const early = a.find('#scope-switch-a') as HTMLElement;
		const text = early.textContent || '';
		expect(text).not.toBe('missing');
		expect(text).toMatch(/tsrx-[a-z0-9]+ card/i);
		a.unmount();
		const b = mount(SwitchScopeStyleRef as any, { which: 'b' });
		expectClassMap(b.find('#scope-switch-b') as HTMLElement, 'rgb(81, 82, 83)');
		b.unmount();
	});
});
