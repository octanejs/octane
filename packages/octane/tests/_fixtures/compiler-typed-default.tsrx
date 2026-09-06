const EMPTY_ARRAY: readonly unknown[] = [];
export function List({ items = EMPTY_ARRAY as string[] }: { items?: string[] }) {
	return <span>{items.join(',')}</span>;
}
