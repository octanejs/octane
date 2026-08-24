// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
export function reduxDevtoolsJsonStringifyReplacer(key: string, value: unknown) {
	if (value instanceof HTMLElement) {
		return `HTMLElement <${value.tagName} class="${value.className}">`;
	}
	if (value === window) {
		return 'global.window';
	}
	if (key === 'children' && typeof value === 'object' && value !== null) {
		return '<<CHILDREN>>';
	}
	return value;
}
