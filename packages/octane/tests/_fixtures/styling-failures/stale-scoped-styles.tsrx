// Repro fixture for audit ledger entry SFL-001: an agent refactor renamed
// the `<span class="count">` badge to `<strong class="total">` but left the
// `.count` rule behind in the scoped <style> block. The compiler prunes the
// dead rule into a `/* (unused) */` comment with no diagnostic, so the
// stale style ships silently — the maintainer-observed failure mode.
export function CartSummary() @{
	<>
		<style>
			.total {
				font-weight: bold;
			}
			.count {
				color: rgb(200, 0, 0);
			}
		</style>
		<p>
			{'Items: '}
			<strong class="total">{'3'}</strong>
		</p>
	</>
}
