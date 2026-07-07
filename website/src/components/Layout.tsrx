// Root layout: sticky top nav (wordmark + Docs / Blog / GitHub) over the routed
// page. Styling is octane's scoped <style> — router <Link>s are separate
// components, so their classes are styled through :global() descendant holes.
import { Link, Outlet } from '@octanejs/router';
import logoUrl from '../assets/octane-logo.svg';

export function Layout() @{
	<div class="shell">
		<header class="topnav">
			<div class="topnav-inner">
				<Link to="/" class="wordmark" aria-label="Octane home">
					<img src={logoUrl} alt="Octane" class="wordmark-img" />
				</Link>
				<nav class="navlinks" aria-label="Main">
					<Link to="/docs" activeOptions={{ exact: false }} class="nav-link">Docs</Link>
					<a class="nav-link" href="/llms.txt">llms.txt</a>
					<a
						class="nav-link"
						href="https://github.com/octanejs/octane"
						target="_blank"
						rel="noreferrer"
					>
						GitHub
					</a>
				</nav>
			</div>
		</header>
		<main class="main">
			<Outlet />
		</main>
		<footer class="footer">
			<div class="footer-inner">
				<span>{'MIT licensed. Built with Octane (TSRX).'}</span>
				<a href="https://github.com/octanejs/octane" target="_blank" rel="noreferrer">
					octanejs/octane
				</a>
			</div>
		</footer>
		<style>
			.shell {
				min-height: 100vh;
				display: flex;
				flex-direction: column;
			}
			.topnav {
				position: sticky;
				top: 0;
				z-index: 10;
				background: rgba(35, 39, 47, 0.85);
				backdrop-filter: blur(12px);
				border-bottom: 1px solid rgba(255, 255, 255, 0.1);
			}
			.topnav-inner {
				max-width: 1200px;
				margin: 0 auto;
				padding: 0 1.5rem;
				height: 60px;
				display: flex;
				align-items: center;
				justify-content: space-between;
			}
			.topnav-inner :global(a.wordmark) {
				display: inline-flex;
				align-items: center;
			}
			.topnav-inner :global(a.wordmark:hover) {
				text-decoration: none;
			}
			.topnav-inner :global(img.wordmark-img) {
				height: 30px;
				width: auto;
				display: block;
			}
			.navlinks {
				display: flex;
				align-items: center;
				gap: 0.25rem;
			}
			.navlinks :global(a.nav-link) {
				color: #99a1b3;
				font-weight: 500;
				padding: 0.4rem 0.9rem;
				border-radius: 9999px;
				transition:
					background 0.15s,
					color 0.15s;
			}
			.navlinks :global(a.nav-link:hover) {
				color: #f4eee8;
				background: rgba(255, 255, 255, 0.06);
				text-decoration: none;
			}
			.navlinks :global(a.nav-link[data-status='active']) {
				color: #ff5d72;
				background: rgba(255, 65, 90, 0.14);
			}
			.main {
				flex: 1;
				width: 100%;
			}
			.footer {
				border-top: 1px solid rgba(255, 255, 255, 0.1);
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
				color: #99a1b3;
				font-size: 0.875rem;
			}
		</style>
	</div>
}
