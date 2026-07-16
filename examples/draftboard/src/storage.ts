import { cloneDocument, isBoardId, type BoardDocument, type BoardShape } from './types';

const STORAGE_PREFIX = 'draftboard.document.v1.';
const MAX_DOCUMENT_TEXT_LENGTH = 120;
const MAX_SHAPE_ID_LENGTH = 80;
const MAX_SHAPE_TEXT_LENGTH = 120;
const MIN_SHAPE_COORDINATE = -10_000;
const MAX_SHAPE_COORDINATE = 10_000;
const MIN_SHAPE_SIZE = 24;
const MAX_SHAPE_SIZE = 5_000;
const MAX_SHAPES = 100;
const SAFE_FILLS = new Set(['#ffd166', '#74d3ae', '#8ec5ff', '#f6a6c1']);

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isBoundedText(value: unknown, maximum: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maximum &&
		value.trim() === value
	);
}

function isBoundedNumber(value: unknown, minimum: number, maximum: number): value is number {
	return isFiniteNumber(value) && value >= minimum && value <= maximum;
}

function readShape(value: unknown): BoardShape | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const shape = value as Record<string, unknown>;
	if (
		!isBoundedText(shape.id, MAX_SHAPE_ID_LENGTH) ||
		!/^[a-z0-9][a-z0-9-]*$/.test(shape.id) ||
		!isBoundedText(shape.label, MAX_SHAPE_TEXT_LENGTH) ||
		typeof shape.fill !== 'string' ||
		!SAFE_FILLS.has(shape.fill) ||
		!isBoundedNumber(shape.x, MIN_SHAPE_COORDINATE, MAX_SHAPE_COORDINATE) ||
		!isBoundedNumber(shape.y, MIN_SHAPE_COORDINATE, MAX_SHAPE_COORDINATE) ||
		!isBoundedNumber(shape.width, MIN_SHAPE_SIZE, MAX_SHAPE_SIZE) ||
		!isBoundedNumber(shape.height, MIN_SHAPE_SIZE, MAX_SHAPE_SIZE)
	) {
		return null;
	}
	return {
		id: shape.id,
		label: shape.label,
		x: shape.x,
		y: shape.y,
		width: shape.width,
		height: shape.height,
		fill: shape.fill,
	};
}

export function readStoredBoard(boardId: BoardDocument['id']): BoardDocument | null {
	try {
		const raw = localStorage.getItem(`${STORAGE_PREFIX}${boardId}`);
		if (raw === null) return null;
		const value = JSON.parse(raw) as unknown;
		if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
		const document = value as Record<string, unknown>;
		if (
			typeof document.id !== 'string' ||
			!isBoardId(document.id) ||
			document.id !== boardId ||
			!isBoundedText(document.title, MAX_DOCUMENT_TEXT_LENGTH) ||
			!isBoundedText(document.updatedBy, MAX_DOCUMENT_TEXT_LENGTH) ||
			!Array.isArray(document.shapes) ||
			document.shapes.length > MAX_SHAPES
		) {
			return null;
		}
		const ids = new Set<string>();
		const shapes: BoardShape[] = [];
		for (const candidate of document.shapes) {
			const shape = readShape(candidate);
			if (shape === null || ids.has(shape.id)) return null;
			ids.add(shape.id);
			shapes.push(shape);
		}
		return cloneDocument({
			id: document.id,
			title: document.title,
			updatedBy: document.updatedBy,
			shapes,
		});
	} catch {
		return null;
	}
}

export function writeStoredBoard(document: BoardDocument): boolean {
	try {
		localStorage.setItem(`${STORAGE_PREFIX}${document.id}`, JSON.stringify(document));
		return true;
	} catch {
		return false;
	}
}
