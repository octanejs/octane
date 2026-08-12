// Ported in source order from react-draggable@4.7.1 lib/utils/getPrefix.ts.
const prefixes = ['Moz', 'Webkit', 'O', 'ms'];
export function getPrefix(prop = 'transform'): string {
	if (typeof window === 'undefined') return '';
	const style = window.document?.documentElement?.style;
	if (!style || prop in style) return '';
	for (const prefix of prefixes) if (browserPrefixToKey(prop, prefix) in style) return prefix;
	return '';
}
export function browserPrefixToKey(prop: string, prefix: string): string {
	return prefix ? `${prefix}${kebabToTitleCase(prop)}` : prop;
}
export function browserPrefixToStyle(prop: string, prefix: string): string {
	return prefix ? `-${prefix.toLowerCase()}-${prop}` : prop;
}
function kebabToTitleCase(str: string): string {
	let out = '',
		shouldCapitalize = true;
	for (const char of str) {
		if (shouldCapitalize) {
			out += char.toUpperCase();
			shouldCapitalize = false;
		} else if (char === '-') shouldCapitalize = true;
		else out += char;
	}
	return out;
}
export default getPrefix();
