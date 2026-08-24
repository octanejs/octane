import { vi } from 'vitest';

export interface CanvasOperation {
	name: string;
	args: unknown[];
}

export interface CanvasMocks {
	operationsFor(canvas: HTMLCanvasElement): CanvasOperation[];
	requestAnimationFrame: ReturnType<typeof vi.fn>;
	cancelAnimationFrame: ReturnType<typeof vi.fn>;
	intersectionObservers: MockIntersectionObserver[];
}

class MockIntersectionObserver {
	readonly observe = vi.fn();
	readonly disconnect = vi.fn();

	constructor(
		readonly callback: IntersectionObserverCallback,
		readonly options?: IntersectionObserverInit,
	) {}

	setVisible(target: Element, isIntersecting: boolean): void {
		this.callback([{ isIntersecting, target } as IntersectionObserverEntry], this as never);
	}
}

function mediaQueryList(query: string): MediaQueryList {
	return {
		matches: false,
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(() => true),
	};
}

export function installCanvasMocks({ intersection = false } = {}): CanvasMocks {
	const operations = new WeakMap<HTMLCanvasElement, CanvasOperation[]>();
	const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
	const operation = (canvas: HTMLCanvasElement, name: string, ...args: unknown[]) => {
		const log = operations.get(canvas) ?? [];
		log.push({ name, args });
		operations.set(canvas, log);
	};
	Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
		configurable: true,
		value(this: HTMLCanvasElement, kind: string) {
			if (kind !== '2d') return null;
			let context = contexts.get(this);
			if (!context) {
				const canvas = this;
				context = {
					set fillStyle(value: string | CanvasGradient | CanvasPattern) {
						operation(canvas, 'fillStyle', value);
					},
					set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
						operation(canvas, 'strokeStyle', value);
					},
					set lineWidth(value: number) {
						operation(canvas, 'lineWidth', value);
					},
					setTransform: (...args: unknown[]) => operation(canvas, 'setTransform', ...args),
					clearRect: (...args: unknown[]) => operation(canvas, 'clearRect', ...args),
					beginPath: (...args: unknown[]) => operation(canvas, 'beginPath', ...args),
					arc: (...args: unknown[]) => operation(canvas, 'arc', ...args),
					fill: (...args: unknown[]) => operation(canvas, 'fill', ...args),
					moveTo: (...args: unknown[]) => operation(canvas, 'moveTo', ...args),
					lineTo: (...args: unknown[]) => operation(canvas, 'lineTo', ...args),
					stroke: (...args: unknown[]) => operation(canvas, 'stroke', ...args),
				} as unknown as CanvasRenderingContext2D;
				contexts.set(this, context);
			}
			return context;
		},
	});

	let nextFrame = 0;
	const requestAnimationFrame = vi.fn(() => ++nextFrame);
	const cancelAnimationFrame = vi.fn();
	vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
	vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
	vi.stubGlobal('matchMedia', vi.fn(mediaQueryList));

	const intersectionObservers: MockIntersectionObserver[] = [];
	if (intersection) {
		vi.stubGlobal(
			'IntersectionObserver',
			class extends MockIntersectionObserver {
				constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
					super(callback, options);
					intersectionObservers.push(this);
				}
			},
		);
	} else {
		vi.stubGlobal('IntersectionObserver', undefined);
	}

	return {
		operationsFor: (canvas) => operations.get(canvas) ?? [],
		requestAnimationFrame,
		cancelAnimationFrame,
		intersectionObservers,
	};
}
