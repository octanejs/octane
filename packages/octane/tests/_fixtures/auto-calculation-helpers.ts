// Cross-module helpers for the auto-calculation fixture. An imported callee is
// opaque to the importing module's compilation, so these exist to exercise the
// admitted-projection path rather than to hide behavior.

export function projectRows(rows: ReadonlyArray<{ id: number; n: number }>): string[] {
	return rows.map((r) => `r${r.id}:${r.n}`);
}

export function tagged(value: string): string {
	return `[${value}]`;
}
