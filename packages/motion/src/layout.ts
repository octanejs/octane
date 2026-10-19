export interface LayoutBox {
	left: number;
	top: number;
	width: number;
	height: number;
}

export type LayoutAnimationMode = true | 'position' | 'size';

export interface LayoutProjection {
	from: string;
	to: string;
}

export interface LayoutSnapshot {
	box: LayoutBox;
	visual: LayoutBox;
	transform: string;
	basis: DOMMatrix | null;
	scroll: { left: number; top: number };
}

export function layoutAnimationMode(layout: unknown): LayoutAnimationMode {
	return layout === 'position' || layout === 'size' ? layout : true;
}

function bounds(matrix: DOMMatrix, box: LayoutBox): LayoutBox {
	const a = matrix.transformPoint({ x: box.left, y: box.top });
	const b = matrix.transformPoint({ x: box.left + box.width, y: box.top });
	const c = matrix.transformPoint({ x: box.left, y: box.top + box.height });
	const d = matrix.transformPoint({ x: box.left + box.width, y: box.top + box.height });
	const left = Math.min(a.x, b.x, c.x, d.x);
	const top = Math.min(a.y, b.y, c.y, d.y);
	return {
		left,
		top,
		width: Math.max(a.x, b.x, c.x, d.x) - left,
		height: Math.max(a.y, b.y, c.y, d.y) - top,
	};
}

function planar(matrix: DOMMatrix): DOMMatrix | null {
	if (matrix.is2D) return matrix;
	if (
		matrix.m13 !== 0 ||
		matrix.m14 !== 0 ||
		matrix.m23 !== 0 ||
		matrix.m24 !== 0 ||
		matrix.m31 !== 0 ||
		matrix.m32 !== 0 ||
		matrix.m34 !== 0 ||
		matrix.m43 !== 0 ||
		matrix.m33 !== 1 ||
		matrix.m44 !== 1
	)
		return null;
	return new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]);
}

function invertible(matrix: DOMMatrix): boolean {
	return matrix.is2D && matrix.a * matrix.d !== matrix.b * matrix.c;
}

function independentTransform(style: CSSStyleDeclaration): DOMMatrix | null {
	const rotate = style.rotate === 'none' ? [] : style.rotate.split(' ');
	const rotation = new DOMMatrix(
		rotate.length === 4
			? `rotate3d(${rotate.join(',')})`
			: rotate.length === 2
				? `rotate${rotate[0]}(${rotate[1]})`
				: rotate.length
					? `rotate(${rotate[0]})`
					: undefined,
	);
	const scale = style.scale === 'none' ? [] : style.scale.split(' ');
	const scaling = new DOMMatrix(
		scale.length ? `${scale.length === 3 ? 'scale3d' : 'scale'}(${scale.join(',')})` : undefined,
	);
	const matrix = planar(rotation.multiply(scaling));
	return matrix && invertible(matrix) ? matrix : null;
}

const REPLACED_INLINE =
	/^(audio|button|canvas|embed|iframe|img|input|object|select|textarea|video)$/;

function layoutScroll(node: Element, position: string): { left: number; top: number } {
	let left = 0;
	let top = 0;
	let current: Element | null = node;
	while (current) {
		// Sticky displacement is clamped, so its outer scroll is not a linear translation.
		if (position === 'sticky') break;
		let parent: Element | null;
		if (position === 'absolute' || position === 'fixed') {
			parent = (current as HTMLElement).offsetParent;
		} else {
			const root = current.getRootNode();
			parent =
				current.assignedSlot ??
				current.parentElement ??
				(root instanceof ShadowRoot ? root.host : null);
		}
		if (!parent) break;
		left += parent.scrollLeft;
		top += parent.scrollTop;
		const style = getComputedStyle(parent);
		if (left !== 0 || top !== 0) {
			if (
				(style.display !== 'inline' ||
					parent.namespaceURI === 'http://www.w3.org/2000/svg' ||
					REPLACED_INLINE.test(parent.localName)) &&
				(style.transform !== 'none' || style.rotate !== 'none' || style.scale !== 'none')
			) {
				const independent = independentTransform(style);
				const transform = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
				if (independent && transform.is2D) {
					const scroll = independent.multiply(transform).transformPoint({ x: left, y: top, w: 0 });
					left = scroll.x;
					top = scroll.y;
				}
			}
			const zoom = Number.parseFloat(style.zoom) || 1;
			left *= zoom;
			top *= zoom;
		}
		current = parent;
		position = style.position;
	}
	return { left, top };
}

/** Read the author's geometry without changing transform declarations or scroll extents. */
export function readLayout(node: HTMLElement | SVGGraphicsElement): LayoutSnapshot {
	const rect = node.getBoundingClientRect();
	const visual = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
	const style = getComputedStyle(node);
	const identity =
		node.namespaceURI !== 'http://www.w3.org/2000/svg' &&
		style.transform === 'none' &&
		style.rotate === 'none' &&
		style.scale === 'none';
	const transform = identity
		? null
		: planar(new DOMMatrix(style.transform === 'none' ? undefined : style.transform));
	const snapshot: LayoutSnapshot = {
		box: visual,
		visual,
		transform: identity ? 'matrix(1, 0, 0, 1, 0, 0)' : (transform?.toString() ?? style.transform),
		basis: null,
		scroll: layoutScroll(node, style.position),
	};
	const independent = identity ? null : independentTransform(style);
	if (!identity && (!transform || !invertible(transform) || !independent)) return snapshot;
	const [originX, originY] = style.transformOrigin.split(' ').map(Number.parseFloat);
	if (!Number.isFinite(originX) || !Number.isFinite(originY)) return snapshot;

	if (node.namespaceURI === 'http://www.w3.org/2000/svg' && node.localName !== 'svg') {
		const graphics = node as SVGGraphicsElement;
		const screen = graphics.getScreenCTM();
		if (!screen) return snapshot;
		const local = graphics.getBBox();
		const matrix = new DOMMatrix([screen.a, screen.b, screen.c, screen.d, screen.e, screen.f]);
		const basis = matrix.translate(originX, originY).multiply(transform!.inverse());
		if (!invertible(basis)) return snapshot;
		snapshot.box = bounds(basis.multiply(independent!.inverse()).translate(-originX, -originY), {
			left: local.x,
			top: local.y,
			width: local.width,
			height: local.height,
		});
		snapshot.basis = basis;
		return snapshot;
	}

	// Non-replaced inline boxes cannot receive CSS transforms, even with an explicit width.
	if (
		style.display === 'inline' &&
		node.namespaceURI !== 'http://www.w3.org/2000/svg' &&
		!REPLACED_INLINE.test(node.localName)
	)
		return snapshot;
	let width = Number.parseFloat(style.width);
	let height = Number.parseFloat(style.height);
	if (style.boxSizing !== 'border-box') {
		width +=
			Number.parseFloat(style.paddingLeft) +
			Number.parseFloat(style.paddingRight) +
			Number.parseFloat(style.borderLeftWidth) +
			Number.parseFloat(style.borderRightWidth);
		height +=
			Number.parseFloat(style.paddingTop) +
			Number.parseFloat(style.paddingBottom) +
			Number.parseFloat(style.borderTopWidth) +
			Number.parseFloat(style.borderBottomWidth);
	}
	if (!Number.isFinite(width) || !Number.isFinite(height)) return snapshot;
	const local = { left: 0, top: 0, width, height };
	const transformed = identity
		? local
		: bounds(
				new DOMMatrix()
					.translate(originX, originY)
					.multiply(independent!)
					.multiply(transform!)
					.translate(-originX, -originY),
				local,
			);
	// Computed matrices have rounded entries; reject geometry outside this single-box model.
	const tolerance = Math.max(0.01, visual.width * 0.00001, visual.height * 0.00001);
	if (
		Math.abs(transformed.width - visual.width) > tolerance ||
		Math.abs(transformed.height - visual.height) > tolerance
	)
		return snapshot;
	const left = visual.left - transformed.left;
	const top = visual.top - transformed.top;
	snapshot.box = { left, top, width, height };
	// Individual translate is already included in the measured viewport displacement.
	snapshot.basis = identity
		? new DOMMatrix([1, 0, 0, 1, left + originX, top + originY])
		: new DOMMatrix().translate(left + originX, top + originY).multiply(independent!);
	return snapshot;
}

export function projectLayout(
	previous: LayoutBox,
	next: LayoutSnapshot,
	mode: LayoutAnimationMode,
): LayoutProjection | null {
	if (!next.basis) return null;
	const box = next.visual;
	const scale = mode !== 'position';
	const scaleX = scale && box.width ? previous.width / box.width : 1;
	const scaleY = scale && box.height ? previous.height / box.height : 1;
	const x = mode === 'size' ? 0 : previous.left - box.left;
	const y = mode === 'size' ? 0 : previous.top - box.top;

	if (x === 0 && y === 0 && scaleX === 1 && scaleY === 1) return null;
	const originX = mode === 'size' ? next.basis.e : box.left;
	const originY = mode === 'size' ? next.basis.f : box.top;
	const projection = new DOMMatrix()
		.translate(originX + x, originY + y)
		.scale(scaleX, scaleY)
		.translate(-originX, -originY);
	const transform = new DOMMatrix(next.transform);
	return {
		from: next.basis
			.inverse()
			.multiply(projection)
			.multiply(next.basis)
			.multiply(transform)
			.toString(),
		to: next.transform,
	};
}

export function projectedLayoutBox(snapshot: LayoutSnapshot, transform: string): LayoutBox {
	if (!snapshot.basis) return snapshot.visual;
	const projection = snapshot.basis
		.multiply(new DOMMatrix(transform))
		.multiply(new DOMMatrix(snapshot.transform).inverse())
		.multiply(snapshot.basis.inverse());
	return bounds(projection, snapshot.visual);
}

export function layoutCellKey(namespace: readonly string[] | undefined, layoutId: unknown): string {
	let key = '';
	if (namespace) {
		for (const segment of namespace) key += `${segment.length}:${segment}|`;
	}
	const id = String(layoutId);
	return `${key}${id.length}:${id}`;
}

// Shared layout snapshots only bridge replacements in the current synchronous
// commit. Preserve every handoff in that commit, then expire anything unclaimed
// at the next microtask so no snapshot survives into a later turn.
const layoutCells = new Map<string, LayoutBox>();
let pendingClear: object | null = null;

function scheduleLayoutCellClear(): void {
	if (pendingClear) return;
	const token = {};
	pendingClear = token;
	queueMicrotask(() => {
		if (pendingClear !== token) return;
		layoutCells.clear();
		pendingClear = null;
	});
}

export function recordLayoutCell(id: string, box: LayoutBox): void {
	layoutCells.set(id, box);
	scheduleLayoutCellClear();
}

export function takeLayoutCell(id: string): LayoutBox | undefined {
	const box = layoutCells.get(id);
	if (box) layoutCells.delete(id);
	return box;
}

export const layoutCellsForTests = {
	size: (): number => layoutCells.size,
	reset(): void {
		layoutCells.clear();
		pendingClear = null;
	},
};
