// The render-outline overlay: a full-viewport canvas that flashes a labeled
// rectangle over every component that just rendered, fading out over the
// configured animation speed. Ported from react-scan's outline renderer
// concept; rects come from the inspection channel's pull-based `domNodes()`
// instead of fiber→hostNode walks, and are re-measured every animation frame
// so outlines follow scrolling and layout shifts while they fade.
//
// Everything here is defensive: the overlay is a dev tool drawn OVER an
// application, so it must never throw, never intercept input
// (pointer-events: none), and degrade to a no-op where canvas 2D is
// unavailable (jsdom, headless environments without canvas).
import type { OctaneRenderInfo, Options, RenderSink } from './core.js';

interface ActiveOutline {
	element: Element;
	name: string;
	count: number;
	addedAt: number;
}

/** Fade duration per react-scan animationSpeed setting. */
const FADE_MS = { fast: 450, slow: 1200 } as const;
/** react-scan's signature purple. */
const OUTLINE_RGB = '129, 108, 255';
const LABEL_FONT = '10px ui-monospace, Menlo, Consolas, monospace';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let outlines = new Map<Element, ActiveOutline>();
let frame = 0;
let speed: 'slow' | 'fast' = 'fast';

function sizeCanvas(): void {
	if (canvas === null || ctx === null) return;
	const dpr = window.devicePixelRatio || 1;
	canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
	canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function ensureContext(): CanvasRenderingContext2D | null {
	if (ctx !== null) return ctx;
	if (canvas === null) {
		canvas = document.createElement('canvas');
		canvas.setAttribute('data-octane-scan', '');
		canvas.setAttribute('aria-hidden', 'true');
		// Above the app, invisible to input and assistive tech.
		canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
		document.documentElement.appendChild(canvas);
		window.addEventListener('resize', sizeCanvas, { passive: true });
	}
	ctx = canvas.getContext('2d');
	if (ctx === null) return null;
	sizeCanvas();
	return ctx;
}

function draw(now: number): void {
	const context = ctx;
	if (context === null || canvas === null) return;
	context.clearRect(0, 0, window.innerWidth, window.innerHeight);
	const fade = FADE_MS[speed];
	for (const outline of outlines.values()) {
		const alpha = 1 - (now - outline.addedAt) / fade;
		if (alpha <= 0 || !outline.element.isConnected) {
			outlines.delete(outline.element);
			continue;
		}
		// Re-measured per frame so the outline tracks scroll/layout while fading.
		const rect = outline.element.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) continue;
		context.strokeStyle = `rgba(${OUTLINE_RGB}, ${alpha})`;
		context.lineWidth = 1;
		context.strokeRect(rect.x, rect.y, rect.width, rect.height);
		const label = outline.count > 1 ? `${outline.name} ×${outline.count}` : outline.name;
		context.font = LABEL_FONT;
		const width = context.measureText(label).width;
		context.fillStyle = `rgba(${OUTLINE_RGB}, ${alpha})`;
		context.fillRect(rect.x, Math.max(0, rect.y - 12), width + 8, 12);
		context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
		context.fillText(label, rect.x + 4, Math.max(9, rect.y - 3));
	}
	if (outlines.size > 0) {
		frame = requestAnimationFrame(draw);
	} else {
		frame = 0;
		context.clearRect(0, 0, window.innerWidth, window.innerHeight);
	}
}

/** The core's per-commit sink: flash every component that just rendered. */
export const outlineSink: RenderSink = {
	batch(infos: OctaneRenderInfo[], options: Options): void {
		const configured = options.animationSpeed ?? 'fast';
		if (configured === 'off') return;
		if (ensureContext() === null) {
			// No 2D canvas here (jsdom) — never accumulate unfadeable outlines.
			outlines.clear();
			return;
		}
		speed = configured;
		const now = performance.now();
		for (const info of infos) {
			if (info.type !== 'component-render') continue;
			for (const element of info.domNodes()) {
				const existing = outlines.get(element);
				if (existing !== undefined) {
					existing.count++;
					existing.addedAt = now;
					existing.name = info.component;
				} else {
					outlines.set(element, { element, name: info.component, count: 1, addedAt: now });
				}
			}
		}
		if (outlines.size > 0 && frame === 0) frame = requestAnimationFrame(draw);
	},
};

/** Test/devtools hygiene: stop animating and remove the overlay entirely. */
export function teardownOutlines(): void {
	if (frame !== 0) cancelAnimationFrame(frame);
	frame = 0;
	outlines = new Map();
	if (canvas !== null) {
		window.removeEventListener('resize', sizeCanvas);
		canvas.remove();
	}
	canvas = null;
	ctx = null;
}
