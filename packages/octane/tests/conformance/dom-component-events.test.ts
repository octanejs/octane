import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../_helpers';
import { createRoot, flushSync } from '../../src/index.js';
import {
	SourceError,
	SvgImageEvents,
	LinkEvents,
	LoadOnlyLink,
	ErrorOnlyLink,
	CaptureOnlyLink,
	LinkSpreadEvents,
	NestedLinkEvents,
	OuterApp,
	InnerApp,
	TapClick,
	PortalClick,
} from './_fixtures/dom-component-events.tsrx';

// ============================================================================
// ReactDOMComponent-test.js — event delivery on host components
// ============================================================================
// Octane delegates at the ROOT CONTAINER (React 17+ shape). Non-bubbling
// media/resource events (error/load/…) are capture-phase-delegated with
// logical-tree propagation (EMULATED_BUBBLING_EVENTS), so target and ancestor
// handlers fire without replacing the native Event object.

describe('ReactDOMComponent — non-bubbling resource events', () => {
	// Per ReactDOMComponent-test.js:1652 — should work error event on <source> element
	it('fires onError on a <source> element', () => {
		const calls: string[] = [];
		const r = mount(SourceError, { onError: () => calls.push('onError called') });
		const errorEvent = document.createEvent('Event');
		errorEvent.initEvent('error', false, false);
		r.container.getElementsByTagName('source')[0].dispatchEvent(errorEvent);
		expect(calls).toEqual(['onError called']);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1963 — should work load and error events on <image> element in SVG
	it('fires onError and onLoad on an SVG <image> element', () => {
		const calls: string[] = [];
		const r = mount(SvgImageEvents, {
			onError: () => calls.push('onError called'),
			onLoad: () => calls.push('onLoad called'),
		});
		const image = r.container.getElementsByTagName('image')[0];
		const errorEvent = document.createEvent('Event');
		const loadEvent = document.createEvent('Event');
		errorEvent.initEvent('error', false, false);
		loadEvent.initEvent('load', false, false);
		image.dispatchEvent(errorEvent);
		image.dispatchEvent(loadEvent);
		expect(calls).toEqual(['onError called', 'onLoad called']);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1992 — should receive a load event on <link> elements
	// Per ReactDOMComponent-test.js:2010 — should receive an error event on <link> elements
	// React keeps links with resource event handlers in their authored position.
	it('keeps a <link> with onLoad/onError inline and fires both handlers', () => {
		const calls: string[] = [];
		const before = document.head.querySelectorAll('link').length;
		const r = mount(LinkEvents, {
			onLoad: () => calls.push('load'),
			onError: () => calls.push('error'),
		});
		try {
			const link = r.container.querySelector('link[href="http://example.org/link"]');
			expect(link).not.toBeNull();
			expect(document.head.querySelectorAll('link')).toHaveLength(before);
			const loadEvent = document.createEvent('Event');
			loadEvent.initEvent('load', false, false);
			link!.dispatchEvent(loadEvent);
			expect(calls).toEqual(['load']);
			const errorEvent = document.createEvent('Event');
			errorEvent.initEvent('error', false, false);
			link!.dispatchEvent(errorEvent);
			expect(calls).toEqual(['load', 'error']);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1992/:2010 — either resource handler
	// independently prevents an otherwise hoistable link from moving to <head>.
	it.each([
		{ event: 'load', href: 'http://example.org/load-only', component: LoadOnlyLink },
		{ event: 'error', href: 'http://example.org/error-only', component: ErrorOnlyLink },
	])('keeps a <link> with only an on$event handler inline', ({ event, href, component }) => {
		const calls: string[] = [];
		const r = mount(component, { handler: (received: Event) => calls.push(received.type) });
		try {
			const selector = `link[href="${href}"]`;
			const link = r.container.querySelector(selector);
			expect(link).not.toBeNull();
			expect(document.head.querySelector(selector)).toBeNull();
			link!.dispatchEvent(new Event(event, { bubbles: false }));
			expect(calls).toEqual([event]);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1992/:2010 — capture-only listeners do not
	// disable resource hoisting, but remain live on the hoisted link.
	it('keeps capture-only resource links hoisted and delivers both events', () => {
		const calls: string[] = [];
		const r = mount(CaptureOnlyLink, { handler: (event: Event) => calls.push(event.type) });
		try {
			const selector = 'link[href="http://example.org/capture-only"]';
			expect(r.container.querySelector(selector)).toBeNull();
			const link = document.head.querySelector(selector);
			expect(link).not.toBeNull();
			link!.dispatchEvent(new Event('load', { bubbles: false }));
			link!.dispatchEvent(new Event('error', { bubbles: false }));
			expect(calls).toEqual(['load', 'error']);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1992/:2010 and
	// ReactDOMEventPropagation-test.js:983/:1015 — resource handlers keep their
	// authored DOM position and propagate through capture and bubble ancestors.
	it('propagates nested link load/error through the authored ancestor while metadata stays hoisted', () => {
		const calls: string[] = [];
		const handlers = (location: string) => ({
			onLoad: () => calls.push(`load:${location}:bubble`),
			onLoadCapture: () => calls.push(`load:${location}:capture`),
			onError: () => calls.push(`error:${location}:bubble`),
			onErrorCapture: () => calls.push(`error:${location}:capture`),
		});
		const r = mount(NestedLinkEvents, {
			ancestor: handlers('ancestor'),
			target: handlers('target'),
		});
		try {
			const parent = r.find('.link-parent');
			const link = parent.querySelector('link[href="http://example.org/nested-link"]');
			expect(link).not.toBeNull();
			expect(document.head.querySelector('link[href="http://example.org/nested-link"]')).toBeNull();
			expect(
				document.head.querySelector(
					'link[rel="canonical"][href="http://example.org/canonical-link"]',
				),
			).not.toBeNull();

			link!.dispatchEvent(new Event('load', { bubbles: false }));
			link!.dispatchEvent(new Event('error', { bubbles: false }));
			expect(calls).toEqual([
				'load:ancestor:capture',
				'load:target:capture',
				'load:target:bubble',
				'load:ancestor:bubble',
				'error:ancestor:capture',
				'error:target:capture',
				'error:target:bubble',
				'error:ancestor:bubble',
			]);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMEventPropagation-test.js:983/:1015 — stopping an inline
	// resource event at its target prevents the ancestor bubble handler.
	it('honors stopPropagation for nested link load/error target handlers', () => {
		const calls: string[] = [];
		const stop = (event: Event) => {
			calls.push(`${event.type}:target:bubble`);
			event.stopPropagation();
		};
		const r = mount(NestedLinkEvents, {
			ancestor: {
				onLoad: () => calls.push('load:ancestor:bubble'),
				onLoadCapture: () => calls.push('load:ancestor:capture'),
				onError: () => calls.push('error:ancestor:bubble'),
				onErrorCapture: () => calls.push('error:ancestor:capture'),
			},
			target: {
				onLoad: stop,
				onLoadCapture: () => calls.push('load:target:capture'),
				onError: stop,
				onErrorCapture: () => calls.push('error:target:capture'),
			},
		});
		try {
			const link = r.container.querySelector('link[href="http://example.org/nested-link"]');
			expect(link).not.toBeNull();
			link!.dispatchEvent(new Event('load', { bubbles: false }));
			link!.dispatchEvent(new Event('error', { bubbles: false }));
			expect(calls).toEqual([
				'load:ancestor:capture',
				'load:target:capture',
				'load:target:bubble',
				'error:ancestor:capture',
				'error:target:capture',
				'error:target:bubble',
			]);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1992/:2010 — removed resource handlers
	// must stop receiving events when a later prop spread omits them.
	it('removes hoisted link onLoad/onError handlers omitted from an updated spread', () => {
		const calls: string[] = [];
		const r = mount(LinkSpreadEvents, {
			handlers: {
				onLoad: () => calls.push('load'),
				onError: () => calls.push('error'),
			},
		});
		try {
			const link = document.head.querySelector('link[href="http://example.org/spread-link"]')!;
			link.dispatchEvent(new Event('load'));
			link.dispatchEvent(new Event('error'));
			expect(calls).toEqual(['load', 'error']);

			r.update(LinkSpreadEvents, { handlers: {} });
			expect(document.head.querySelector('link[href="http://example.org/spread-link"]')).toBe(link);
			link.dispatchEvent(new Event('load'));
			link.dispatchEvent(new Event('error'));
			expect(calls).toEqual(['load', 'error']);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1992/:2010 — capture and bubble handlers
	// on the same resource event are independent props across updates.
	it('replaces hoisted link load/error capture and bubble handlers without stale callbacks', () => {
		const calls: string[] = [];
		const handlers = (version: string) => ({
			onLoad: () => calls.push(`${version}:load:bubble`),
			onLoadCapture: () => calls.push(`${version}:load:capture`),
			onError: () => calls.push(`${version}:error:bubble`),
			onErrorCapture: () => calls.push(`${version}:error:capture`),
		});
		const r = mount(LinkSpreadEvents, { handlers: handlers('first') });
		try {
			const link = document.head.querySelector('link[href="http://example.org/spread-link"]')!;
			link.dispatchEvent(new Event('load'));
			link.dispatchEvent(new Event('error'));
			expect(calls).toEqual([
				'first:load:capture',
				'first:load:bubble',
				'first:error:capture',
				'first:error:bubble',
			]);

			const replacement = handlers('second');
			r.update(LinkSpreadEvents, { handlers: replacement });
			link.dispatchEvent(new Event('load'));
			link.dispatchEvent(new Event('error'));
			expect(calls).toEqual([
				'first:load:capture',
				'first:load:bubble',
				'first:error:capture',
				'first:error:bubble',
				'second:load:capture',
				'second:load:bubble',
				'second:error:capture',
				'second:error:bubble',
			]);

			r.update(LinkSpreadEvents, { handlers: replacement });
			link.dispatchEvent(new Event('load'));
			link.dispatchEvent(new Event('error'));
			expect(calls.slice(-4)).toEqual([
				'second:load:capture',
				'second:load:bubble',
				'second:error:capture',
				'second:error:bubble',
			]);
			expect(calls).toHaveLength(12);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:1992/:2010 — unmounting a resource must
	// disconnect its event props even if consumer code retains its DOM node.
	it('stops hoisted link load/error capture and bubble handlers after unmount', () => {
		const calls: string[] = [];
		const r = mount(LinkSpreadEvents, {
			handlers: {
				onLoad: () => calls.push('load:bubble'),
				onLoadCapture: () => calls.push('load:capture'),
				onError: () => calls.push('error:bubble'),
				onErrorCapture: () => calls.push('error:capture'),
			},
		});
		const link = document.head.querySelector('link[href="http://example.org/spread-link"]')!;
		r.unmount();
		expect(link.isConnected).toBe(false);
		link.dispatchEvent(new Event('load'));
		link.dispatchEvent(new Event('error'));
		expect(calls).toEqual([]);
	});
});

describe('ReactDOMComponent — event ordering across nested roots', () => {
	// Per ReactDOMComponent-test.js:3746 — receives events in specific order
	it('fires document capture → outer/inner capture → inner/outer bubble → document bubble', () => {
		const eventOrder: string[] = [];
		const track = (tag: string) => () => eventOrder.push(tag);
		let outerEl: HTMLElement | null = null;
		let innerEl: HTMLElement | null = null;

		const r = mount(OuterApp, {
			oref: (el: HTMLElement) => (outerEl = el),
			onBubble: track('outer bubble'),
			onCapture: track('outer capture'),
		});
		flushEffects();
		const innerRoot = createRoot(outerEl!);
		innerRoot.render(InnerApp as any, {
			iref: (el: HTMLElement) => (innerEl = el),
			onBubble: track('inner bubble'),
			onCapture: track('inner capture'),
		});
		flushSync(() => {});
		flushEffects();

		const docBubble = track('document bubble');
		const docCapture = track('document capture');
		document.addEventListener('click', docBubble);
		document.addEventListener('click', docCapture, true);
		try {
			innerEl!.click();
			expect(eventOrder).toEqual([
				'document capture',
				'outer capture',
				'inner capture',
				'inner bubble',
				'outer bubble',
				'document bubble',
			]);
		} finally {
			document.removeEventListener('click', docBubble);
			document.removeEventListener('click', docCapture, true);
			innerRoot.unmount();
			r.unmount();
		}
	});
});

describe('ReactDOMComponent — iOS tap highlight', () => {
	// Per ReactDOMComponent-test.js:3817 — React stamps a noop `onclick` PROPERTY
	// on EVERY element with an onClick prop (an iOS Safari workaround dating from
	// document-level delegation, where Safari suppressed clicks on non-interactive
	// elements with no direct/ancestor onclick).
	// INTENTIONAL DIVERGENCE (adjudicated 2026-07-04): octane delegates at the
	// ROOT CONTAINER and stamps the noop `onclick` THERE once (createRoot
	// containers + portal targets — see registerDelegationTarget), which makes the
	// whole subtree tappable on iOS without per-element property writes. Elements
	// stay untouched.
	it('stamps the noop onclick on the delegation ROOT, not on each element', () => {
		const r = mount(TapClick, { h: () => {} });
		expect(typeof (r.container as HTMLElement).onclick).toBe('function'); // root stamped
		expect((r.container.firstElementChild as HTMLElement).onclick).toBe(null); // element untouched
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:3832 — adds onclick handler to a portal root
	it('stamps a noop onclick property on a portal root', () => {
		const portalContainer = document.createElement('div');
		document.body.appendChild(portalContainer);
		const r = mount(PortalClick, { h: () => {}, target: portalContainer });
		try {
			expect(typeof portalContainer.onclick).toBe('function');
		} finally {
			r.unmount();
			portalContainer.remove();
		}
	});
});
