// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
export function getClassNameFromUnknown(u: unknown): string {
	if (u && typeof u === 'object' && 'className' in u && typeof u.className === 'string') {
		return u.className;
	}
	return '';
}
