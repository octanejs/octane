const getTemplate = (type: string, prop: string): string =>
	`[@portabletext/react] Unknown ${type}, specify a component for it in the \`components.${prop}\` prop`;

export const unknownTypeWarning = (typeName: string): string =>
	getTemplate(`block type "${typeName}"`, 'types');
export const unknownMarkWarning = (markType: string): string =>
	getTemplate(`mark type "${markType}"`, 'marks');
export const unknownBlockStyleWarning = (blockStyle: string): string =>
	getTemplate(`block style "${blockStyle}"`, 'block');
export const unknownListStyleWarning = (listStyle: string): string =>
	getTemplate(`list style "${listStyle}"`, 'list');
export const unknownListItemStyleWarning = (listStyle: string): string =>
	getTemplate(`list item style "${listStyle}"`, 'listItem');

export function printWarning(message: string): void {
	console.warn(message);
}
