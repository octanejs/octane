import { afterEach, vi } from 'vitest';

class ResizeObserverMock implements ResizeObserver {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

class IntersectionObserverMock implements IntersectionObserver {
	readonly root = null;
	readonly rootMargin = '0px';
	readonly thresholds = [0];

	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
	takeRecords(): IntersectionObserverEntry[] {
		return [];
	}
}

class PointerEventMock extends MouseEvent implements PointerEvent {
	readonly altitudeAngle = 0;
	readonly azimuthAngle = 0;
	readonly height: number;
	readonly isPrimary: boolean;
	readonly pointerId: number;
	readonly pointerType: string;
	readonly pressure: number;
	readonly tangentialPressure = 0;
	readonly tiltX = 0;
	readonly tiltY = 0;
	readonly twist = 0;
	readonly width: number;
	readonly persistentDeviceId = 0;

	constructor(type: string, init: PointerEventInit = {}) {
		super(type, init);
		this.height = init.height ?? 1;
		this.isPrimary = init.isPrimary ?? true;
		this.pointerId = init.pointerId ?? 1;
		this.pointerType = init.pointerType ?? 'mouse';
		this.pressure = init.pressure ?? 0;
		this.width = init.width ?? 1;
	}

	getCoalescedEvents(): PointerEvent[] {
		return [this];
	}

	getPredictedEvents(): PointerEvent[] {
		return [];
	}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);
vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);

if (typeof PointerEvent === 'undefined') {
	vi.stubGlobal('PointerEvent', PointerEventMock);
}

vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
	callback(performance.now());
	return 1;
});
vi.stubGlobal('cancelAnimationFrame', () => {});

if (!window.matchMedia) {
	window.matchMedia = (query: string) =>
		({
			matches: false,
			media: query,
			onchange: null,
			addListener() {},
			removeListener() {},
			addEventListener() {},
			removeEventListener() {},
			dispatchEvent: () => false,
		}) as MediaQueryList;
}

if (!HTMLElement.prototype.setPointerCapture) {
	HTMLElement.prototype.setPointerCapture = () => {};
	HTMLElement.prototype.releasePointerCapture = () => {};
	HTMLElement.prototype.hasPointerCapture = () => false;
}

if (!Element.prototype.getAnimations) {
	Element.prototype.getAnimations = () => [];
}

if (!Document.prototype.getAnimations) {
	Document.prototype.getAnimations = () => [];
}

if (!document.elementFromPoint) {
	document.elementFromPoint = () => null;
}

afterEach(() => {
	document.body.replaceChildren();
	vi.restoreAllMocks();
});
