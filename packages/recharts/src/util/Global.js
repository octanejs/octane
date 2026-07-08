// Vendored verbatim from recharts@3.9.2 es6/util/Global.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
var parseIsSsrByDefault = () =>
	!(
		typeof window !== 'undefined' &&
		window.document &&
		Boolean(window.document.createElement) &&
		window.setTimeout
	);
export var Global = {
	devToolsEnabled: true,
	isSsr: parseIsSsrByDefault(),
};
