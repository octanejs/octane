export function ClientOnlyBadge() @{
	const host =
		typeof window !== 'undefined' ? window.location.host : 'missing';
	<>
		<p class="client-only-badge" data-testid="client-only-badge">
			{'Mounted client-only on ' + host}
		</p>
		<style>
			.client-only-badge {
				display: inline-block;
				padding: 0.5rem 0.75rem;
				border-radius: 0.375rem;
				background: #14532d;
				color: #ecfdf5;
				font-size: 0.875rem;
			}
		</style>
	</>
}
