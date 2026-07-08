// Vendored verbatim from recharts@3.9.2 es6/state/selectors/numberDomainEqualityCheck.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
export var numberDomainEqualityCheck = (a, b) => {
	if (a === b) {
		return true;
	}
	if (a == null || b == null) {
		return false;
	}
	return a[0] === b[0] && a[1] === b[1];
};
