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

export function layoutAnimationMode(layout: unknown): LayoutAnimationMode {
	return layout === 'position' || layout === 'size' ? layout : true;
}

export function projectLayout(
	previous: LayoutBox,
	next: LayoutBox,
	mode: LayoutAnimationMode,
): LayoutProjection | null {
	const translate = mode !== 'size';
	const scale = mode !== 'position';
	const x = translate ? previous.left - next.left : 0;
	const y = translate ? previous.top - next.top : 0;
	const scaleX = scale && next.width ? previous.width / next.width : 1;
	const scaleY = scale && next.height ? previous.height / next.height : 1;

	if (x === 0 && y === 0 && scaleX === 1 && scaleY === 1) return null;
	if (mode === 'position') {
		return {
			from: `translate(${x}px, ${y}px)`,
			to: 'translate(0px, 0px)',
		};
	}
	if (mode === 'size') {
		return {
			from: `scale(${scaleX}, ${scaleY})`,
			to: 'scale(1, 1)',
		};
	}
	return {
		from: `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`,
		to: 'translate(0px, 0px) scale(1, 1)',
	};
}

export function layoutTransition(transition: any): any {
	const selected = transition?.layout ?? transition?.default ?? transition;
	if (selected !== transition && selected?.inherit && transition) {
		const { inherit: _inherit, ...valueTransition } = selected;
		return { ...transition, ...valueTransition };
	}
	return selected;
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
