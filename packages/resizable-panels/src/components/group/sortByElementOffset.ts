import type { Orientation } from './types';

export function sortByElementOffset<
	Type extends { element: HTMLElement },
	ReturnType extends Type[],
>(orientation: Orientation, items: Type[]): ReturnType {
	return Array.from(items).sort(
		orientation === 'horizontal' ? horizontalSort : verticalSort,
	) as ReturnType;
}

function horizontalSort<Type extends { element: HTMLElement }>(a: Type, b: Type) {
	const delta = a.element.offsetLeft - b.element.offsetLeft;
	return delta !== 0 ? delta : a.element.offsetWidth - b.element.offsetWidth;
}

function verticalSort<Type extends { element: HTMLElement }>(a: Type, b: Type) {
	const delta = a.element.offsetTop - b.element.offsetTop;
	return delta !== 0 ? delta : a.element.offsetHeight - b.element.offsetHeight;
}
