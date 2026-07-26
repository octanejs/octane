// Cross-module helpers for the autoMemo render-call contract fixture.
//
// An IMPORTED callee is admitted as a value projection on the documented
// module-boundary assumption (the compiler cannot read this file from the
// importing module's compilation). `projectValue` honours that assumption —
// it is a pure function of its argument — so a region memoized through it must
// still re-render whenever the argument it was given actually changes.

export function projectValue(row: { id: number; value: number }): string {
	return `i${row.id}:${row.value}`;
}

export function projectCount(n: number): string {
	return `n${n}`;
}
