// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
export function isWellBehavedNumber(n: unknown): n is number {
	return Number.isFinite(n);
}

export function isPositiveNumber(n: unknown): n is number {
	return typeof n === 'number' && n > 0 && Number.isFinite(n);
}
