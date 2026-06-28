import { describe, it, expect } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { OverlayApp } from './_fixtures/overlay.tsx';

describe('@octanejs/floating-ui — components', () => {
	it('FloatingOverlay (a .ts component via createElement) renders a fixed div', () => {
		const r = mount(OverlayApp);
		const ov = r.container.querySelector('.ov') as HTMLElement;
		expect(ov).not.toBe(null);
		expect(ov.tagName).toBe('DIV');
		expect(ov.style.position).toBe('fixed');
		// scroll-lock applied to body.
		expect(document.body.style.overflow).toBe('hidden');
		r.unmount();
		// cleanup restores body overflow.
		expect(document.body.style.overflow).toBe('');
	});
});

import { nextPaint } from '../../octane/tests/_helpers';
import { PortalApp } from './_fixtures/portal-app.tsx';

describe('@octanejs/floating-ui — FloatingPortal', () => {
	it('portals children into a node in document.body, then cleans up', async () => {
		const r = mount(PortalApp);
		await nextPaint();
		await nextPaint();
		const ported = document.querySelector('[data-floating-ui-portal] .ported');
		expect(ported).not.toBe(null);
		expect(r.container.querySelector('.ported')).toBe(null);
		r.unmount();
		await nextPaint();
		expect(document.querySelector('.ported')).toBe(null);
	});
});

import { ArrowApp } from './_fixtures/arrow.tsx';

describe('@octanejs/floating-ui — FloatingArrow', () => {
	it('renders an SVG-namespaced arrow once the floating element exists', async () => {
		const r = mount(ArrowApp);
		await nextPaint();
		const svg = r.container.querySelector('.floating svg') as SVGSVGElement;
		expect(svg).not.toBe(null);
		expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
		// strokeWidth>0 → two <path>s (clip + fill) + a <clipPath>.
		expect(svg.querySelectorAll('path').length).toBe(2);
		expect(svg.querySelector('clipPath')!.localName).toBe('clipPath');
		// kebab-case SVG attribute written verbatim.
		expect(svg.querySelector('path')!.getAttribute('stroke-width')).toBe('5');
		r.unmount();
	});
});

import { Dialog } from './_fixtures/dialog.tsx';

describe('@octanejs/floating-ui — FloatingFocusManager (modal)', () => {
	it('traps focus + aria-hides outside content while open, cleans up on close', async () => {
		const r = mount(Dialog);
		const trigger = r.container.querySelector('.trigger') as HTMLElement;
		const outside = r.container.querySelector('.outside') as HTMLElement;

		trigger.focus();
		trigger.click();
		const tick = () => new Promise((res) => setTimeout(res, 0));
		for (let i = 0; i < 8; i++) await tick();

		expect(r.container.querySelector('.dialog')).not.toBe(null);
		// markOthers aria-hides siblings of the floating element's ancestry.
		expect(outside.getAttribute('aria-hidden')).toBe('true');
		// initialFocus=0 → focus the first tabbable inside the dialog.
		expect(document.activeElement).toBe(r.container.querySelector('.dialog-input'));

		(r.container.querySelector('.close') as HTMLElement).click();
		for (let i = 0; i < 4; i++) await tick();
		expect(r.container.querySelector('.dialog')).toBe(null);
		// markOthers cleanup restores the outside element.
		expect(outside.getAttribute('aria-hidden')).toBe(null);
		r.unmount();
	});
});

import { Toolbar } from './_fixtures/toolbar.tsx';

describe('@octanejs/floating-ui — Composite', () => {
	it('renders items with a single tab stop (roving tabindex) + arrow navigation', async () => {
		const r = mount(Toolbar);
		const tick = () => new Promise((res) => setTimeout(res, 0));
		for (let i = 0; i < 6; i++) await tick();

		const toolbar = r.container.querySelector('.toolbar') as HTMLElement;
		expect(toolbar.getAttribute('aria-orientation')).toBe('horizontal');
		const items = Array.from(r.container.querySelectorAll('.item')) as HTMLElement[];
		expect(items.length).toBe(3);
		// Roving tabindex: only the active (index 0) item is tabbable.
		expect(items[0].getAttribute('tabindex')).toBe('0');
		expect(items[1].getAttribute('tabindex')).toBe('-1');

		// ArrowRight on the active item navigates + focuses the next.
		items[0].focus();
		items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		for (let i = 0; i < 4; i++) await tick();
		expect(items[1].getAttribute('tabindex')).toBe('0');
		expect(items[0].getAttribute('tabindex')).toBe('-1');
		r.unmount();
	});
});
