import { it, expect } from 'vitest';
import { flushSync } from '../src/index.js';
import { mount } from './_helpers';
import { DangerHtml, BareInnerHtml, SpreadDanger, setHtml } from './_fixtures/danger-html.tsx';

// React-parity raw HTML: `dangerouslySetInnerHTML={{__html}}` is the supported
// surface; bare `innerHTML` is no longer special-cased.

it('dangerouslySetInnerHTML sets raw HTML and updates on re-render', () => {
	const r = mount(DangerHtml as any, { html: '<b class="x">hi</b>' });
	const el = r.find('#d') as HTMLElement;
	expect(el.querySelector('b.x')?.textContent).toBe('hi');
	// Update the __html → the diff re-sets innerHTML.
	flushSync(() => setHtml('<i class="y">bye</i>'));
	expect(el.querySelector('b.x')).toBeNull();
	expect(el.querySelector('i.y')?.textContent).toBe('bye');
	r.unmount();
});

it('bare `innerHTML` is NOT raw HTML (no longer supported)', () => {
	const r = mount(BareInnerHtml as any, { html: '<b>nope</b>' });
	const el = r.find('#b') as HTMLElement;
	// The markup is NOT parsed into DOM — bare innerHTML is just a plain attribute.
	expect(el.querySelector('b')).toBeNull();
	expect(el.childNodes.length).toBe(0);
	r.unmount();
});

it('a spread carrying dangerouslySetInnerHTML sets raw HTML', () => {
	const r = mount(SpreadDanger as any, {
		attrs: { title: 't', dangerouslySetInnerHTML: { __html: '<span class="z">via spread</span>' } },
	});
	const el = r.find('#s') as HTMLElement;
	expect(el.getAttribute('title')).toBe('t'); // other spread attrs applied
	expect(el.querySelector('span.z')?.textContent).toBe('via spread');
	expect(el.hasAttribute('dangerouslysetinnerhtml')).toBe(false); // not a dead attr
	r.unmount();
});
