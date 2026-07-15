// The site footer strip. Layout decides whether it renders at all — the
// playground fills the viewport below the nav and has no footer under it.
export function Footer() @{
	<footer class="footer">
		<div class="footer-inner">
			<span>{'MIT licensed. Built with Octane (TSRX).'}</span>
			<a href="https://github.com/octanejs/octane" target="_blank" rel="noreferrer">
				octanejs/octane
			</a>
		</div>
		<style>
			.footer {
				border-top: 1px solid var(--border);
				margin-top: 4rem;
			}
			.footer-inner {
				max-width: 1200px;
				margin: 0 auto;
				padding: 1.5rem;
				display: flex;
				justify-content: space-between;
				flex-wrap: wrap;
				gap: 0.5rem;
				color: var(--text-secondary);
				font-size: 0.875rem;
			}
		</style>
	</footer>
}
