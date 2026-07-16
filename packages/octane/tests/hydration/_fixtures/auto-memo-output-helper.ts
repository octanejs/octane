import { createElement, type ComponentBody } from 'octane';

export function buildHydrationRows(
	items: Array<{ id: number; label: string }>,
	Row: ComponentBody<any>,
) {
	return items.map((item) =>
		createElement(Row, {
			key: item.id,
			id: item.id,
			label: item.label,
		}),
	);
}
