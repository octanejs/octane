import { Link } from '@octanejs/router';

export function NotFound() @{
	<div class="notfound">
		<p class="notfound-code">404</p>
		<h1 class="notfound-title">Page not found</h1>
		<p class="notfound-sub">That route didn’t match anything.</p>
		<Link to="/" class="notfound-home">Back to the homepage</Link>
		<style>
			.notfound {
				max-width: 1200px;
				margin: 0 auto;
				padding: 6rem 1.5rem;
				text-align: center;
			}
			.notfound-code {
				font-size: 4rem;
				font-weight: 800;
				color: #58c4dc;
				margin: 0;
				letter-spacing: -0.04em;
			}
			.notfound-title {
				margin: 0 0 0.5rem;
			}
			.notfound-sub {
				color: #99a1b3;
				margin: 0 0 2rem;
			}
			.notfound :global(a.notfound-home) {
				background: #087ea4;
				color: #f6f7f9;
				font-weight: 600;
				padding: 0.7rem 1.4rem;
				border-radius: 9999px;
			}
			.notfound :global(a.notfound-home:hover) {
				background: #0a91b8;
				text-decoration: none;
			}
		</style>
	</div>
}
