// Ported from @lexical/react/src/__tests__/browser/useMenuAnchorRefPosition.test.tsx (0.51.0).
// All 4 upstream cases are ported. Upstream runs them in a real browser because
// jsdom does no layout; the Octane lexical project is jsdom-only, so this port
// stubs the one piece of layout the hook reads (the positioned parent's
// getBoundingClientRect) and resolves the anchor's on-screen position with the
// CSS containing-block rule (`anchorViewportRect` below) instead of asking the
// engine. Upstream's margins/sizes only feed real layout, so they are expressed
// as the stubbed parent rect. The 0.46.0 -> 0.51.0 diffs of the jsdom
// useMenuAnchorRef(.shadow).test.tsx files are type-only and port nothing.
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import { createEditor, type LexicalEditor } from 'lexical';
import { mount, flushEffects } from '../_helpers';
import type { MenuResolution } from '@octanejs/lexical/shared/menuShared';
import { MenuAnchorProbe } from '../_fixtures/menu-anchor-probe.tsrx';

let editor: LexicalEditor;

// The probe has no composer; the mocked context hands out an editor whose root
// element is attached to the document (upstream's composer renders one).
vi.mock('@octanejs/lexical/LexicalComposerContext', () => ({
	useLexicalComposerContext: () => [editor],
}));

// Where the caret would be, in viewport coordinates.
const CARET_RECT = { height: 18, left: 150, top: 250, width: 2 };

// Where the positioned parent's border box sits in the viewport (upstream gets
// this from `margin-left: 120px; margin-top: 200px` on a 400x300 box).
const PARENT_RECT = { height: 300, left: 120, top: 200, width: 400 };

const resolution: MenuResolution = {
	getRect: () => new DOMRect(CARET_RECT.left, CARET_RECT.top, CARET_RECT.width, CARET_RECT.height),
};

function createPositionedParent(scrollable = false): HTMLElement {
	const parent = document.createElement('div');
	// A positioned ancestor establishes a containing block for the absolutely
	// positioned anchor, so anchor coordinates are relative to this box.
	parent.style.position = 'relative';
	parent.style.width = `${PARENT_RECT.width}px`;
	parent.style.height = `${PARENT_RECT.height}px`;
	parent.getBoundingClientRect = () =>
		new DOMRect(PARENT_RECT.left, PARENT_RECT.top, PARENT_RECT.width, PARENT_RECT.height);
	if (scrollable) {
		parent.style.overflow = 'auto';
		const spacer = document.createElement('div');
		spacer.style.height = '1000px';
		parent.appendChild(spacer);
	}
	document.body.appendChild(parent);
	onTestFinished(() => parent.remove());
	return parent;
}

/**
 * Where an absolutely positioned element lands in the viewport: its `left`/`top`
 * are measured from the padding box of its containing block, the nearest
 * positioned ancestor (scrolled with it), or from the document origin when every
 * ancestor is static.
 */
function anchorViewportRect(anchor: HTMLElement): { left: number; top: number } {
	let originLeft = -window.pageXOffset;
	let originTop = -window.pageYOffset;
	for (let el = anchor.parentElement; el !== null; el = el.parentElement) {
		if (getComputedStyle(el).position !== 'static') {
			const rect = el.getBoundingClientRect();
			originLeft = rect.left + el.clientLeft - el.scrollLeft;
			originTop = rect.top + el.clientTop - el.scrollTop;
			break;
		}
	}
	return {
		left: originLeft + parseFloat(anchor.style.left),
		top: originTop + parseFloat(anchor.style.top),
	};
}

/** The anchor should land at the caret regardless of its containing block. */
function expectAtCaret(anchor: HTMLElement): void {
	const rect = anchorViewportRect(anchor);
	expect(rect.left).toBeCloseTo(CARET_RECT.left, 0);
	expect(rect.top).toBeCloseTo(CARET_RECT.top + 3, 0);
}

describe('useMenuAnchorRef positioning', () => {
	let rootElement: HTMLDivElement;

	beforeEach(() => {
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe() {}
				unobserve() {}
				disconnect() {}
			},
		);
		rootElement = document.createElement('div');
		rootElement.contentEditable = 'true';
		document.body.appendChild(rootElement);
		editor = createEditor({
			namespace: 'test',
			onError: (e: unknown) => {
				throw e;
			},
		});
		editor.setRootElement(rootElement);
	});

	afterEach(() => {
		editor.setRootElement(null);
		rootElement.remove();
		vi.unstubAllGlobals();
	});

	function renderProbe(props: { parent?: HTMLElement; initiallyOpen?: boolean }) {
		let anchorElement: HTMLElement | null = null;
		const probeProps = (open: boolean) => ({
			resolution: open ? resolution : null,
			setResolution: () => {},
			className: 'test-menu-anchor',
			parent: props.parent,
			onRef: (ref: { current: HTMLElement | null }) => {
				anchorElement = ref.current;
			},
		});
		const r = mount(MenuAnchorProbe as any, probeProps(props.initiallyOpen ?? true));
		flushEffects();
		onTestFinished(() => r.unmount());
		return {
			getAnchor: () => anchorElement,
			// Opens the menu after the initial render, the way a typeahead trigger does.
			openMenu: () => {
				r.update(MenuAnchorProbe as any, probeProps(true));
				flushEffects();
			},
		};
	}

	it('anchors the menu at the caret when parent is the document body', () => {
		const { getAnchor } = renderProbe({});
		const anchor = getAnchor();
		expect(anchor).not.toBeNull();
		expect(anchor!.parentElement).toBe(document.body);
		expectAtCaret(anchor!);
	});

	it('anchors the menu at the caret when parent is a positioned element', () => {
		const parent = createPositionedParent();
		const { getAnchor } = renderProbe({ parent });
		const anchor = getAnchor();
		expect(anchor).not.toBeNull();
		expect(parent.contains(anchor!)).toBe(true);
		// Without accounting for the containing block the anchor is pushed down
		// and right by the parent's own offset.
		expectAtCaret(anchor!);
	});

	// The anchor is removed from the DOM whenever the menu closes, so every open
	// after the initial render positions an element that is still detached,
	// which is the only path a typeahead ever takes, since its resolution starts
	// out null.
	it('anchors the menu at the caret when the menu opens after mount', () => {
		const parent = createPositionedParent();
		const { getAnchor, openMenu } = renderProbe({ parent, initiallyOpen: false });
		openMenu();
		const anchor = getAnchor();
		expect(anchor).not.toBeNull();
		expect(parent.contains(anchor!)).toBe(true);
		expectAtCaret(anchor!);
	});

	it('anchors the menu at the caret when the positioned parent is scrolled', () => {
		const parent = createPositionedParent(true);
		parent.scrollTop = 250;
		expect(parent.scrollTop).toBeGreaterThan(0);
		const { getAnchor } = renderProbe({ parent });
		const anchor = getAnchor();
		expect(anchor).not.toBeNull();
		expectAtCaret(anchor!);
	});
});

// Not upstream: upstream creates the anchor in the editor's owner document but
// still reads the host window's page offsets and listens on the host
// window/document. In a multi-window setup (an editor inside an iframe) those
// belong to the parent browsing context, so the menu lands at the wrong offset
// and never repositions when the frame scrolls.
describe('useMenuAnchorRef in an iframe editor', () => {
	let frame: HTMLIFrameElement;
	let frameWindow: Window & typeof globalThis;
	let frameRoot: HTMLDivElement;

	beforeEach(() => {
		vi.stubGlobal(
			'ResizeObserver',
			class {
				observe() {}
				unobserve() {}
				disconnect() {}
			},
		);
		frame = document.createElement('iframe');
		document.body.appendChild(frame);
		frameWindow = frame.contentWindow as Window & typeof globalThis;
		frameWindow.ResizeObserver = globalThis.ResizeObserver;
		// The frame is scrolled; the host window is not.
		Object.defineProperty(frameWindow, 'pageXOffset', { configurable: true, value: 7 });
		Object.defineProperty(frameWindow, 'pageYOffset', { configurable: true, value: 40 });
		frameRoot = frameWindow.document.createElement('div');
		frameRoot.contentEditable = 'true';
		frameWindow.document.body.appendChild(frameRoot);
		editor = createEditor({
			namespace: 'test',
			onError: (e: unknown) => {
				throw e;
			},
		});
		editor.setRootElement(frameRoot);
	});

	afterEach(() => {
		editor.setRootElement(null);
		frame.remove();
		vi.unstubAllGlobals();
	});

	function renderOpenProbe(): HTMLElement {
		let anchorElement: HTMLElement | null = null;
		const r = mount(MenuAnchorProbe as any, {
			resolution,
			setResolution: () => {},
			className: 'test-menu-anchor',
			onRef: (ref: { current: HTMLElement | null }) => {
				anchorElement = ref.current;
			},
		});
		flushEffects();
		onTestFinished(() => r.unmount());
		expect(anchorElement).not.toBeNull();
		return anchorElement!;
	}

	it("offsets the anchor by the frame's scroll, not the host window's", () => {
		expect(window.pageXOffset).toBe(0);
		expect(window.pageYOffset).toBe(0);
		const anchor = renderOpenProbe();
		expect(anchor.ownerDocument).toBe(frameWindow.document);
		expect(anchor.parentElement).toBe(frameWindow.document.body);
		expect(parseFloat(anchor.style.left)).toBeCloseTo(CARET_RECT.left + 7, 0);
		expect(parseFloat(anchor.style.top)).toBeCloseTo(CARET_RECT.top + 3 + 40, 0);
	});

	it("repositions when the frame's document scrolls", () => {
		const hostFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
		const frameRaf = vi.fn((_callback: FrameRequestCallback) => 0);
		frameWindow.requestAnimationFrame = frameRaf as any;
		renderOpenProbe();
		frameWindow.document.dispatchEvent(new frameWindow.Event('scroll'));
		expect(frameRaf).toHaveBeenCalledTimes(1);
		expect(hostFrame).not.toHaveBeenCalled();
	});
});
