// Overlay plugin — the render-outline canvas. A first-party plugin that
// consumes ONLY commit events and options; it does not know reports, selection,
// or the source. A faithful port of react-scan's `new-outlines/canvas.ts`
// (indigo rgb(115,97,230), pixel-snapped 1px stroke + 10%-alpha fill, 45-frame
// linear fade, lerp easing, getLabelText grouping). The overlay must never
// throw, never intercept input, and no-op where canvas 2D is unavailable.
import { definePlugin, type Plugin, type PluginContext } from '../plugin.js';
import type { CommitEvent } from '../contract.js';
import type { AnimationSpeed } from '../services/options.js';

interface ActiveOutline {
	element: Element;
	name: string;
	count: number;
	frame: number;
	x: number;
	y: number;
	width: number;
	height: number;
	placed: boolean;
}

const PRIMARY_COLOR = '115, 97, 230';
const MONO_FONT = 'Menlo, Consolas, Monaco, "Liberation Mono", "Lucida Console", monospace';
const INTERPOLATION_SPEED = 0.2;
const SNAP_THRESHOLD = 0.5;
const MAX_PARTS_LENGTH = 4;
const MAX_LABEL_LENGTH = 40;
const TOTAL_FRAMES: Record<Exclude<AnimationSpeed, 'off'>, number> = { fast: 45, slow: 90 };

export function overlayPlugin(): Plugin {
	let canvas: HTMLCanvasElement | null = null;
	let ctx: CanvasRenderingContext2D | null = null;
	let outlines = new Map<Element, ActiveOutline>();
	let rafId = 0;
	let totalFrames = TOTAL_FRAMES.fast;

	function getDpr(): number {
		return Math.min(window.devicePixelRatio || 1, 2);
	}

	function sizeCanvas(): void {
		if (canvas === null || ctx === null) return;
		const dpr = getDpr();
		canvas.style.width = `${window.innerWidth}px`;
		canvas.style.height = `${window.innerHeight}px`;
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
			canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483646;';
			document.documentElement.appendChild(canvas);
			window.addEventListener('resize', sizeCanvas, { passive: true });
		}
		ctx = canvas.getContext('2d');
		if (ctx === null) return null;
		sizeCanvas();
		return ctx;
	}

	function lerp(start: number, end: number): number {
		const delta = end - start;
		if (Math.abs(delta) < SNAP_THRESHOLD) return end;
		return start + delta * INTERPOLATION_SPEED;
	}

	function getLabelText(group: ActiveOutline[]): string {
		const countByName = new Map<string, number>();
		for (const outline of group)
			countByName.set(outline.name, (countByName.get(outline.name) ?? 0) + outline.count);
		const namesByCount = new Map<number, string[]>();
		for (const [name, count] of countByName) {
			const names = namesByCount.get(count);
			if (names !== undefined) names.push(name);
			else namesByCount.set(count, [name]);
		}
		const parts: string[] = [];
		for (const [count, names] of Array.from(namesByCount.entries()).sort((a, b) => b[0] - a[0])) {
			let part = `${names.slice(0, MAX_PARTS_LENGTH).join(', ')} ×${count}`;
			if (part.length > MAX_LABEL_LENGTH) part = `${part.slice(0, MAX_LABEL_LENGTH)}…`;
			parts.push(part);
		}
		let text = parts.join(', ');
		if (text.length > MAX_LABEL_LENGTH) text = `${text.slice(0, MAX_LABEL_LENGTH)}…`;
		return text;
	}

	function draw(): void {
		const context = ctx;
		if (context === null || canvas === null) return;
		context.clearRect(0, 0, window.innerWidth, window.innerHeight);

		const groups = new Map<string, ActiveOutline[]>();
		const rects = new Map<
			string,
			{ x: number; y: number; width: number; height: number; alpha: number }
		>();

		for (const outline of outlines.values()) {
			if (!outline.element.isConnected) {
				outlines.delete(outline.element);
				continue;
			}
			const rect = outline.element.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) continue;
			if (!outline.placed) {
				outline.x = rect.x;
				outline.y = rect.y;
				outline.width = rect.width;
				outline.height = rect.height;
				outline.placed = true;
			} else {
				outline.x = lerp(outline.x, rect.x);
				outline.y = lerp(outline.y, rect.y);
				outline.width = lerp(outline.width, rect.width);
				outline.height = lerp(outline.height, rect.height);
			}
			const alpha = 1 - outline.frame / totalFrames;
			outline.frame++;
			if (outline.frame > totalFrames) {
				outlines.delete(outline.element);
				continue;
			}
			const groupKey = `${Math.round(outline.x)},${Math.round(outline.y)}`;
			const group = groups.get(groupKey);
			if (group !== undefined) group.push(outline);
			else groups.set(groupKey, [outline]);
			const rectKey = `${groupKey},${Math.round(outline.width)},${Math.round(outline.height)}`;
			const existing = rects.get(rectKey);
			if (existing === undefined)
				rects.set(rectKey, {
					x: outline.x,
					y: outline.y,
					width: outline.width,
					height: outline.height,
					alpha,
				});
			else if (alpha > existing.alpha) existing.alpha = alpha;
		}

		for (const { x, y, width, height, alpha } of rects.values()) {
			const rx = Math.round(x) + 0.5;
			const ry = Math.round(y) + 0.5;
			context.strokeStyle = `rgba(${PRIMARY_COLOR}, ${alpha})`;
			context.lineWidth = 1;
			context.beginPath();
			context.rect(rx, ry, Math.round(width), Math.round(height));
			context.stroke();
			context.fillStyle = `rgba(${PRIMARY_COLOR}, ${alpha * 0.1})`;
			context.fill();
		}

		context.font = `11px ${MONO_FONT}`;
		for (const group of groups.values()) {
			const first = group[0];
			const alpha = 1 - (first.frame - 1) / totalFrames;
			const text = getLabelText(group);
			const width = context.measureText(text).width;
			const labelY = Math.max(0, first.y - 15);
			context.fillStyle = `rgba(${PRIMARY_COLOR}, ${alpha})`;
			context.fillRect(first.x, labelY, width + 4, 15);
			context.fillStyle = `rgba(255, 255, 255, ${alpha})`;
			context.fillText(text, first.x + 2, labelY + 11);
		}

		if (outlines.size > 0) rafId = requestAnimationFrame(draw);
		else {
			rafId = 0;
			context.clearRect(0, 0, window.innerWidth, window.innerHeight);
		}
	}

	function onCommit(commit: CommitEvent, options: PluginContext['options']): void {
		const configured = options.get().animationSpeed ?? 'fast';
		if (configured === 'off' || options.get().enabled === false) return;
		if (ensureContext() === null) {
			outlines.clear();
			return;
		}
		totalFrames = TOTAL_FRAMES[configured];
		for (const event of commit.events) {
			if (event.type !== 'render') continue;
			for (const element of event.domNodes()) {
				const existing = outlines.get(element);
				if (existing !== undefined) {
					existing.count++;
					existing.frame = 0;
					existing.name = event.component.name;
				} else {
					outlines.set(element, {
						element,
						name: event.component.name,
						count: 1,
						frame: 0,
						x: 0,
						y: 0,
						width: 0,
						height: 0,
						placed: false,
					});
				}
			}
		}
		if (outlines.size > 0 && rafId === 0) rafId = requestAnimationFrame(draw);
	}

	return definePlugin({
		name: 'overlay',
		setup(context) {
			if (typeof document === 'undefined') return;
			const detach = context.onCommit((commit) => onCommit(commit, context.options));
			return () => {
				detach();
				if (rafId !== 0) cancelAnimationFrame(rafId);
				rafId = 0;
				outlines = new Map();
				if (canvas !== null) {
					window.removeEventListener('resize', sizeCanvas);
					canvas.remove();
				}
				canvas = null;
				ctx = null;
			};
		},
	});
}
