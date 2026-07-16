export type BoardId = 'launch' | 'empty';
export type Tool = 'select' | 'rectangle' | 'hand';
export type SyncState = 'saved' | 'saving' | 'queued' | 'error';

export interface BoardShape {
	id: string;
	label: string;
	x: number;
	y: number;
	width: number;
	height: number;
	fill: string;
}

export interface BoardDocument {
	id: BoardId;
	title: string;
	updatedBy: string;
	shapes: BoardShape[];
}

export interface Point {
	x: number;
	y: number;
}

export interface CanvasHandle {
	focusCanvas(): void;
	zoomBy(amount: number): void;
	fitSelection(): void;
}

export function isBoardId(value: string): value is BoardId {
	return value === 'launch' || value === 'empty';
}

export function cloneDocument(document: BoardDocument): BoardDocument {
	return {
		...document,
		shapes: document.shapes.map((shape) => ({ ...shape })),
	};
}
