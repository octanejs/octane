// jsdom mocks for the View Transitions conformance ports — a direct port of
// React's own recipe (ReactDOMViewTransition-test.js:188-249), so the ported
// tests keep their observable semantics:
//
//   - `document.startViewTransition` runs the update callback SYNCHRONOUSLY
//     and returns already-resolved `ready`/`finished` promises — tests assert
//     callback firing and call counts, not animation timing.
//   - `Element.prototype.getBoundingClientRect` derives the rect from
//     textContent length, so update-detection ("did this boundary's size
//     change?") has real signal in a layout-less DOM.
//   - Web Animations API stubs (`animate`, `getAnimations`) let instance
//     callbacks run their imperative bodies.
//   - `document.fonts` / `CSS.escape` exist where jsdom lacks them.
//
// Usage (see view-transition.test.ts):
//   const vt = installViewTransitionMocks();  // in beforeEach
//   ...
//   vt.calls.length                            // startViewTransition spy log
//   vt.restore();                              // in afterEach

export interface ViewTransitionCall {
	/** The options bag passed to document.startViewTransition. */
	options: { update: () => void };
}

export interface ViewTransitionMocks {
	/** Every document.startViewTransition invocation, oldest first. */
	calls: ViewTransitionCall[];
	/** Uninstall everything and restore the saved originals. */
	restore: () => void;
}

export function installViewTransitionMocks(): ViewTransitionMocks {
	const proto = Element.prototype as Element & {
		getAnimations?: unknown;
		animate?: unknown;
	};
	const originalGetBoundingClientRect = proto.getBoundingClientRect;
	const originalGetAnimations = proto.getAnimations;
	const originalAnimate = proto.animate;
	const hadStartViewTransition = 'startViewTransition' in document;
	const originalStartViewTransition = (document as never as Record<string, unknown>)[
		'startViewTransition'
	];
	const hadFonts = 'fonts' in document;
	const globalWithCSS = globalThis as { CSS?: { escape?: (s: string) => string } };
	const hadCSS = typeof globalWithCSS.CSS !== 'undefined';
	const hadCSSEscape = hadCSS && typeof globalWithCSS.CSS!.escape === 'function';

	if (!hadCSS) globalWithCSS.CSS = { escape: (s: string) => s };
	else if (!hadCSSEscape) globalWithCSS.CSS!.escape = (s: string) => s;

	if (!hadFonts) {
		Object.defineProperty(document, 'fonts', {
			value: { status: 'loaded', ready: Promise.resolve() },
			configurable: true,
		});
	}

	proto.getAnimations = function () {
		return [];
	};
	proto.animate = function () {
		return { cancel() {}, finished: Promise.resolve() };
	};
	proto.getBoundingClientRect = function (this: Element) {
		// Content-length-derived rect (React's hasInstanceChanged signal).
		const text = this.textContent || '';
		return new DOMRect(0, 0, text.length * 10 + 10, 20);
	};

	const calls: ViewTransitionCall[] = [];
	(document as never as Record<string, unknown>)['startViewTransition'] = function (options: {
		update: () => void;
	}) {
		calls.push({ options });
		options.update();
		return {
			ready: Promise.resolve(),
			finished: Promise.resolve(),
			skipTransition() {},
		};
	};

	return {
		calls,
		restore() {
			proto.getBoundingClientRect = originalGetBoundingClientRect;
			if (originalGetAnimations === undefined) delete proto.getAnimations;
			else proto.getAnimations = originalGetAnimations;
			if (originalAnimate === undefined) delete proto.animate;
			else proto.animate = originalAnimate;
			if (hadStartViewTransition) {
				(document as never as Record<string, unknown>)['startViewTransition'] =
					originalStartViewTransition;
			} else {
				delete (document as never as Record<string, unknown>)['startViewTransition'];
			}
			if (!hadFonts) delete (document as never as Record<string, unknown>)['fonts'];
			if (!hadCSS) delete globalWithCSS.CSS;
			else if (!hadCSSEscape) delete globalWithCSS.CSS!.escape;
		},
	};
}
