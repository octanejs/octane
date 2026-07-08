// Vendored verbatim from recharts@3.9.2 es6/util/isWellBehavedNumber.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
export function isWellBehavedNumber(n) {
	return Number.isFinite(n);
}
export function isPositiveNumber(n) {
	return typeof n === 'number' && n > 0 && Number.isFinite(n);
}
