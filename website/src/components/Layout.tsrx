// Root layout: sticky top nav (wordmark + Docs / Blog / GitHub) over the routed
// page. Styling is octane's scoped <style> — router <Link>s are separate
// components, so their classes are styled through :global() descendant holes.
// Below 720px the link row collapses behind a hamburger into a dropdown panel.
import { useState } from 'octane';
import { Link, Outlet, useLocation } from '@octanejs/tanstack-router';
import logoUrl from '../assets/octane-logo.svg';

export function Layout() @{
	const [menuOpen, setMenuOpen] = useState(false);
	// The playground fills the viewport below the nav — no footer under it.
	const pathname = useLocation({ select: (l: any) => l.pathname });
	const isDocsPath = pathname === '/docs' || pathname.startsWith('/docs/');
	const showFooter = pathname !== '/playground';
	<div class="shell">
		<header class="topnav">
			<div class={['topnav-inner', isDocsPath && 'docs-width']}>
				<Link to="/" class="wordmark" aria-label="Octane home">
					<img src={logoUrl} alt="Octane" class="wordmark-img" />
				</Link>
				<button
					type="button"
					class="menu-btn"
					aria-label="Toggle navigation menu"
					aria-expanded={menuOpen}
					aria-controls="site-nav"
					onClick={() => setMenuOpen((open) => !open)}
				>
					<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
						@if (menuOpen) {
							<path
								d="M6 6l12 12M18 6L6 18"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							/>
						} @else {
							<path
								d="M4 7h16M4 12h16M4 17h16"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							/>
						}
					</svg>
				</button>
				<nav
					id="site-nav"
					class={['navlinks', menuOpen && 'open']}
					aria-label="Main"
					onClick={() => setMenuOpen(false)}
				>
					<Link to="/docs" activeOptions={{ exact: false }} class="nav-link">Docs</Link>
					<Link to="/benchmarks" class="nav-link">Benchmarks</Link>
					<Link to="/playground" class="nav-link">Playground</Link>
					<a class="nav-link" href="/llms.txt" target="_blank" rel="noreferrer">
						llms.txt
					</a>
					<a class="nav-link" href="https://discord.gg/8puY9fFqd9" target="_blank" rel="noreferrer">
						Discord
					</a>
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
		@if (showFooter) {
			<footer class="footer">
				<div class="footer-inner">
					<span>{'MIT licensed. Built with Octane (TSRX).'}</span>
					<a href="https://github.com/octanejs/octane" target="_blank" rel="noreferrer">
						octanejs/octane
					</a>
				</div>
			</footer>
		}
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
			.topnav-inner.docs-width {
				max-width: 1420px;
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
			.menu-btn {
				display: none;
				align-items: center;
				justify-content: center;
				width: 40px;
				height: 40px;
				border: none;
				border-radius: 10px;
				background: transparent;
				color: #99a1b3;
				cursor: pointer;
			}
			.menu-btn:hover {
				color: #f4eee8;
				background: rgba(255, 255, 255, 0.06);
			}
			.navlinks {
				display: flex;
				align-items: center;
				gap: 0.25rem;
			}
			@media (max-width: 720px) {
				.menu-btn {
					display: inline-flex;
				}
				.navlinks {
					display: none;
					position: absolute;
					top: 60px;
					left: 0;
					right: 0;
					flex-direction: column;
					align-items: stretch;
					gap: 0.25rem;
					padding: 0.75rem 1rem 1rem;
					background: rgba(35, 39, 47, 0.97);
					backdrop-filter: blur(12px);
					border-bottom: 1px solid rgba(255, 255, 255, 0.1);
				}
				.navlinks.open {
					display: flex;
				}
				.navlinks :global(a.nav-link) {
					padding: 0.65rem 1rem;
					border-radius: 12px;
				}
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
