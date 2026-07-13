import type { Data } from '@dnd-kit/abstract';
import type { Draggable, DropAnimation } from '@dnd-kit/dom';

type DragOverlayChild = object | string | number | bigint | boolean | null | undefined;

export interface DragOverlayProps<T extends Data, U extends Draggable<T>> {
	className?: string;
	children: DragOverlayChild | ((source: U) => DragOverlayChild);
	dropAnimation?: DropAnimation | null;
	style?: Record<string, string | number | null | undefined>;
	tag?: string;
	disabled?: boolean | ((source: U | null) => boolean);
}

export declare function DragOverlay<T extends Data, U extends Draggable<T>>(
	props: DragOverlayProps<T, U>,
): unknown;
