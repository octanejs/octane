import { it, expect } from 'vitest';
import { flushSync } from '../src/index.js';
import { mount } from './_helpers';
import {
	DangerHtml,
	BareInnerHtml,
	SpreadDanger,
	DeoptDanger,
	setHtml,
} from './_fixtures/danger-html.tsx';

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

it('de-opt host path (createElement return) applies raw HTML and keeps it across re-renders', () => {
	// Regression: hostElementBody set innerHTML via applyDeoptProps, then unconditionally
	// ran child reconciliation with (empty) children — wiping the raw HTML. children and
	// dangerouslySetInnerHTML are mutually exclusive (React contract); the raw HTML owns
	// the element's content.
	const r = mount(DeoptDanger as any, { html: '.a{color:red}' });
	const el = r.find('#dd') as HTMLElement;
	expect(el.tagName).toBe('STYLE');
	expect(el.textContent).toBe('.a{color:red}');
	// Update flows through patchDeoptProps + the same skip.
	flushSync(() => setHtml('.b{color:blue}'));
	expect(el.textContent).toBe('.b{color:blue}');
	r.unmount();
});
