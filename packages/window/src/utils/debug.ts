import { getContrastColor } from './colors/getContrastColor.js';
import { stringToColor } from './colors/stringToColor.js';

export function debug(namespace: string, ...args: unknown[]) {
	const backgroundColor = stringToColor(namespace);
	const color = getContrastColor(backgroundColor);

	console.log(
		`%c ${namespace} `,
		`background-color: ${backgroundColor}; color: ${color};`,
		...args,
	);
}
