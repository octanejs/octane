import { useMemo } from 'octane';
import getStringWidth from '../text/util/getStringWidth';
import type { BaseDatum, CloudWord, WordcloudConfig } from './types';

const DEGREES_TO_RADIANS = Math.PI / 180;
const HASH_RANGE = 0x1_0000_0000;

export type WordBounds = {
	left: number;
	right: number;
	top: number;
	bottom: number;
};

type ResolvedWord<Datum extends BaseDatum> = Datum & Required<
	Pick<CloudWord, 'font' | 'padding' | 'rotate' | 'size' | 'style' | 'text' | 'weight'>
> & { sourceIndex: number };

function valueAt<Datum, Value>(
	value: Value | ((datum: Datum, index: number) => Value) | undefined,
	datum: Datum,
	index: number,
	fallback: Value,
): Value {
	if (typeof value === 'function') return (value as (datum: Datum, index: number) => Value)(
		datum,
		index,
	);
	return value ?? fallback;
}

function textHash(text: string): number {
	let hash = 2166136261;
	for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
	return hash >>> 0;
}

function deterministicRandom(text: string, index: number, salt: string): number {
	return textHash(`${text}\0${index}\0${salt}`) / HASH_RANGE;
}

function numericFontWeight(weight: string | number): string | number {
	if (weight === 'bold' || weight === 'bolder') return 700;
	if (weight === 'lighter') return 300;
	return weight;
}

/**
 * Estimates the axis-aligned rectangle occupied by a laid-out word. The same
 * browser-independent metric is used for collision checks during SSR and the
 * first client render.
 */
export function getEstimatedWordBounds(
	word: Pick<CloudWord, 'padding' | 'rotate' | 'size' | 'style' | 'text' | 'weight' | 'x' | 'y'>,
): WordBounds {
	const size = Math.max(0, Number(word.size) || 0);
	const padding = Math.max(0, Number(word.padding) || 0);
	const text = word.text ?? '';
	const measuredWidth = getStringWidth(text, {
		fontSize: size,
		fontWeight: numericFontWeight(word.weight ?? 'normal'),
	}) ?? text.length * size * 0.56;
	const italicFactor = /italic|oblique/i.test(String(word.style ?? '')) ? 1.08 : 1;
	const glyphWidth = measuredWidth * italicFactor + padding * 2;
	const glyphHeight = size * 1.2 + padding * 2;
	const angle = (Number(word.rotate) || 0) * DEGREES_TO_RADIANS;
	const sin = Math.abs(Math.sin(angle));
	const cos = Math.abs(Math.cos(angle));
	const rotatedWidth = glyphWidth * cos + glyphHeight * sin;
	const rotatedHeight = glyphWidth * sin + glyphHeight * cos;
	const x = Number(word.x) || 0;
	const y = Number(word.y) || 0;

	return {
		left: x - rotatedWidth / 2,
		right: x + rotatedWidth / 2,
		top: y - rotatedHeight / 2,
		bottom: y + rotatedHeight / 2,
	};
}

function boundsOverlap(a: WordBounds, b: WordBounds): boolean {
	return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function isInsideLayout(bounds: WordBounds, width: number, height: number): boolean {
	const halfWidth = width / 2;
	const halfHeight = height / 2;
	return bounds.left >= -halfWidth && bounds.right <= halfWidth &&
		bounds.top >= -halfHeight &&
		bounds.bottom <= halfHeight;
}

function archimedeanSpiral([width, height]: [number, number]) {
	const aspectRatio = width / height;
	return (input: number): [number, number] => {
		const t = input * 0.1;
		return [aspectRatio * t * Math.cos(t), t * Math.sin(t)];
	};
}

function rectangularSpiral([width, height]: [number, number]) {
	const dy = 4;
	const dx = dy * width / height;
	let x = 0;
	let y = 0;

	return (t: number): [number, number] => {
		const sign = t < 0 ? -1 : 1;
		switch ((Math.sqrt(1 + 4 * sign * t) - sign) & 3) {
			case 0:
				x += dx;
				break;
			case 1:
				y += dy;
				break;
			case 2:
				x -= dx;
				break;
			default:
				y -= dy;
		}
		return [x, y];
	};
}

function cellsForBounds(bounds: WordBounds, cellSize: number): string[] {
	const minX = Math.floor(bounds.left / cellSize);
	const maxX = Math.floor(bounds.right / cellSize);
	const minY = Math.floor(bounds.top / cellSize);
	const maxY = Math.floor(bounds.bottom / cellSize);
	const cells: string[] = [];
	for (let x = minX; x <= maxX; x += 1) {
		for (let y = minY; y <= maxY; y += 1) cells.push(`${x},${y}`);
	}
	return cells;
}

function collides(
	bounds: WordBounds,
	grid: Map<string, WordBounds[]>,
	cellSize: number,
): boolean {
	const candidates = new Set<WordBounds>();
	for (const cell of cellsForBounds(bounds, cellSize)) {
		for (const placed of grid.get(cell) ?? []) candidates.add(placed);
	}
	return [...candidates].some((placed) => boundsOverlap(bounds, placed));
}

function addToGrid(bounds: WordBounds, grid: Map<string, WordBounds[]>, cellSize: number): void {
	for (const cell of cellsForBounds(bounds, cellSize)) {
		const entries = grid.get(cell);
		if (entries) entries.push(bounds);
		else grid.set(cell, [bounds]);
	}
}

export function layoutWordcloud<Datum extends BaseDatum>({
	width,
	height,
	font,
	fontSize,
	fontStyle,
	fontWeight,
	padding,
	random,
	rotate,
	spiral,
	words,
}: WordcloudConfig<Datum>): CloudWord[] {
	if (width <= 0 || height <= 0) return [];

	const resolvedWords = words.map((datum, index): ResolvedWord<Datum> => {
		const text = datum.text;
		const fallbackSize = Math.sqrt(Number((datum as Datum & { value?: number }).value ?? 100));
		const rawSize = Number(valueAt(fontSize, datum, index, fallbackSize));
		const size = Number.isFinite(rawSize) ? Math.max(0, Math.trunc(rawSize)) : 0;
		const resolvedRotate = rotate === undefined
			? random
				? Math.floor(random() * 6 - 3) * 30
				: (textHash(text) % 6 - 3) * 30
			: valueAt(rotate, datum, index, 0);

		return {
			...datum,
			sourceIndex: index,
			text,
			font: valueAt(font, datum, index, 'serif'),
			padding: Math.max(0, Number(valueAt(padding, datum, index, 1)) || 0),
			size,
			style: valueAt(fontStyle, datum, index, 'normal'),
			weight: valueAt(fontWeight, datum, index, 'normal'),
			rotate: Number.isFinite(Number(resolvedRotate)) ? Number(resolvedRotate) : 0,
		};
	}).sort((a, b) => b.size - a.size || a.sourceIndex - b.sourceIndex);

	const placedWords: CloudWord[] = [];
	const grid = new Map<string, WordBounds[]>();
	const cellSize = Math.max(
		8,
		Math.min(64, Math.sqrt(width * height / Math.max(1, words.length))),
	);
	const maxDelta = Math.hypot(width, height);
	const maxSteps = Math.max(2048, Math.ceil(maxDelta * 24));

	for (const resolvedWord of resolvedWords) {
		if (!resolvedWord.text || resolvedWord.size <= 0) continue;
		const randomX = random
			? random()
			: deterministicRandom(resolvedWord.text, resolvedWord.sourceIndex, 'x');
		const randomY = random
			? random()
			: deterministicRandom(resolvedWord.text, resolvedWord.sourceIndex, 'y');
		const directionRandom = random
			? random()
			: deterministicRandom(resolvedWord.text, resolvedWord.sourceIndex, 'direction');
		const startX = Math.floor(width * (randomX + 0.5) / 2) - width / 2;
		const startY = Math.floor(height * (randomY + 0.5) / 2) - height / 2;
		const direction = directionRandom < 0.5 ? 1 : -1;
		const spiralForWord =
			typeof spiral === 'function'
				? spiral([width, height])
				: spiral === 'rectangular'
					? rectangularSpiral([width, height])
					: archimedeanSpiral([width, height]);

		for (let step = 0; step < maxSteps; step += 1) {
			const point = spiralForWord(step * direction);
			if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) break;
			const candidate: CloudWord = {
				...resolvedWord,
				x: startX + Math.trunc(point[0]),
				y: startY + Math.trunc(point[1]),
			};
			delete (candidate as CloudWord & { sourceIndex?: number }).sourceIndex;
			const bounds = getEstimatedWordBounds(candidate);
			if (!isInsideLayout(bounds, width, height) || collides(bounds, grid, cellSize)) continue;

			placedWords.push(candidate);
			addToGrid(bounds, grid, cellSize);
			break;
		}
	}

	return placedWords;
}

export default function useWordcloud<Datum extends BaseDatum>(config: WordcloudConfig<Datum>) {
	const {
		width,
		height,
		font,
		fontSize,
		fontStyle,
		fontWeight,
		padding,
		random,
		rotate,
		spiral,
		words,
	} = config;

	return useMemo(() => layoutWordcloud(config), [
		width,
		height,
		font,
		fontSize,
		fontStyle,
		fontWeight,
		padding,
		random,
		rotate,
		spiral,
		words,
	]);
}
