/** @jsxImportSource octane */

export function InspectInner() {
	return (
		<button type="button" data-testid="inspect-inner">
			inner
		</button>
	);
}

export function InspectOuter() {
	return (
		<div data-testid="inspect-outer">
			<InspectInner />
		</div>
	);
}
