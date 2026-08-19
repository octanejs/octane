export interface TextRow {
	id: string;
	label: string;
}

export function formatTitle(value: string): string {
	return value.toUpperCase();
}
