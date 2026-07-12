import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../_helpers';
import { createRoot, flushSync } from '../../src/index.js';
import {
	SourceError,
	SvgImageEvents,
	LinkEvents,
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
	// GAP: octane hoists <link> into document.head (headBlock), which sits
	// OUTSIDE every event-delegation target (delegation roots are createRoot
	// containers + portal targets) — the capture-phase delegated error/load
	// listener never sees events fired on the hoisted element, so onLoad/onError
	// on a <link> never fire. React attaches to the element and both fire.
	// Runtime location: headBlock hoisting + registerDelegationTarget
	// (runtime.ts) — hoisted head elements need direct listeners.
	it('fires onLoad/onError on a (head-hoisted) <link> element', () => {
		const calls: string[] = [];
		const before = document.head.querySelectorAll('link').length;
		const r = mount(LinkEvents, {
			onLoad: () => calls.push('load'),
			onError: () => calls.push('error'),
		});
		try {
			const links = document.head.querySelectorAll('link');
			const link = links[links.length - 1];
			expect(links.length).toBe(before + 1);
			const loadEvent = document.createEvent('Event');
			loadEvent.initEvent('load', false, false);
			link.dispatchEvent(loadEvent);
			expect(calls).toEqual(['load']);
			const errorEvent = document.createEvent('Event');
			errorEvent.initEvent('error', false, false);
			link.dispatchEvent(errorEvent);
			expect(calls).toEqual(['load', 'error']);
		} finally {
			r.unmount();
		}
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
	// GAP: same Safari workaround on the portal TARGET (React stamps onclick on
	// the portal container). Octane registers the target for delegation but
	// leaves target.onclick untouched. Runtime location:
	// registerDelegationTarget (runtime.ts ~4107).
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
