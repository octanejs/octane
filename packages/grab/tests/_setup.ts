// Browser APIs jsdom does not implement. The overlay's init path touches
// matchMedia/ResizeObserver unconditionally upstream does too; real browsers
// and the pinned pristine environment provide all of these.
if (typeof window !== 'undefined') {
	if (typeof window.matchMedia !== 'function') {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		})) as unknown as typeof window.matchMedia;
	}

	if (typeof globalThis.ResizeObserver === 'undefined') {
		globalThis.ResizeObserver = class ResizeObserver {
			observe(): void {}
			unobserve(): void {}
			disconnect(): void {}
		} as unknown as typeof globalThis.ResizeObserver;
	}

	if (typeof globalThis.PointerEvent === 'undefined' && typeof MouseEvent !== 'undefined') {
		globalThis.PointerEvent = class PointerEvent extends MouseEvent {
			readonly pointerId = 0;
			readonly pointerType = 'mouse';
			readonly isPrimary = true;
		} as unknown as typeof globalThis.PointerEvent;
	}

	if (typeof navigator !== 'undefined' && typeof navigator.clipboard === 'undefined') {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: () => Promise.resolve(),
				readText: () => Promise.resolve(''),
			},
		});
	}

	// jsdom's MutationObserver callbacks can fire on the Node microtask queue
	// where vitest's per-file globals are already swapped; pin the constructor.
	if (typeof globalThis.Node === 'undefined' && typeof window.Node !== 'undefined') {
		globalThis.Node = window.Node;
	}

	// Web Animations API is unimplemented in jsdom; activation freezes running
	// animations and iterates these collections.
	if (typeof Document !== 'undefined' && typeof Document.prototype.getAnimations !== 'function') {
		Document.prototype.getAnimations = () => [];
	}
	if (typeof Element !== 'undefined' && typeof Element.prototype.getAnimations !== 'function') {
		Element.prototype.getAnimations = () => [];
	}
}
