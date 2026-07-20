// The sticky top bar: two clusters — wordmark + section links on the left,
// search and the theme toggle on the right. Router <Link>s are separate
// components, so their classes are styled through :global() descendant holes.
// Below 720px the left link row collapses behind a hamburger into a dropdown
// panel; the X/Discord/GitHub icons move out of the bar into the bottom of that
// dropdown (the same <SocialIcons> is rendered in both places, toggled by CSS).
import { useState } from 'octane';
import { Link } from '@octanejs/tanstack-router';
import { DocsSearch } from './DocsSearch.tsrx';
import { ThemeToggle } from './ThemeToggle.tsrx';
import { SocialIcons } from './SocialIcons.tsrx';
import logoSvg from '../assets/octane-logo.svg?raw';

export function Header() @{
	const [menuOpen, setMenuOpen] = useState(false);

	<header class="topnav">
		<div class="topnav-inner">
			<div class="nav-left">
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
				<Link to="/" class="wordmark" aria-label="Octane home">
					<span
						class="wordmark-img"
						aria-hidden="true"
						dangerouslySetInnerHTML={{ __html: logoSvg }}
					/>
				</Link>
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
					<div class="menu-social">
						<SocialIcons />
					</div>
				</nav>
			</div>
			<div class="nav-right">
				<DocsSearch />
				<span class="nav-sep" aria-hidden="true"></span>
				<span class="bar-social">
					<SocialIcons />
				</span>
				<ThemeToggle />
			</div>
		</div>
		<style>
			.topnav {
				position: sticky;
				top: 0;
				z-index: 10;
				background: var(--header-bg);
				backdrop-filter: blur(12px);
				border-bottom: 1px solid var(--border);
			}
			.topnav-inner {
				max-width: 1420px;
				margin: 0 auto;
				padding: 0 1.5rem;
				height: 60px;
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
			}
			.nav-left,
			.nav-right {
				display: flex;
				align-items: center;
				min-width: 0;
			}
			.nav-left {
				gap: 1.5rem;
			}
			.nav-right {
				gap: 0.25rem;
			}
			.nav-left,
			.nav-right {
				display: flex;
				align-items: center;
				min-width: 0;
			}
			.nav-left {
				gap: 1.5rem;
			}
			.nav-right {
				gap: 0.25rem;
			}
			.topnav-inner :global(a.wordmark) {
				display: inline-flex;
				align-items: center;
			}
			.topnav-inner :global(a.wordmark:hover) {
				text-decoration: none;
			}
			/* 32px, not 30: the logo viewBox carries 8 units of optical headroom at
			   the bottom (see octane-logo.svg), so the taller box keeps the glyphs
			   at their original rendered size. */
			/* Inline SVG so the wordmark lettering follows --text per theme (the
			   flame keeps its brand red); sized by the svg child. */
			.topnav-inner :global(.wordmark-img) {
				display: inline-flex;
				color: var(--text);
			}
			.topnav-inner :global(.wordmark-img svg) {
				height: 32px;
				width: auto;
				display: block;
			}
			.menu-btn {
				display: none;
				align-items: center;
				justify-content: center;
				width: 40px;
				height: 40px;
				margin-left: -0.5rem;
				border: none;
				border-radius: 10px;
				background: transparent;
				color: var(--text-secondary);
				cursor: pointer;
			}
			.menu-btn:hover {
				color: var(--text);
				background: var(--surface);
			}
			.navlinks {
				display: flex;
				align-items: center;
				gap: 0.25rem;
			}
			.nav-sep {
				width: 1px;
				height: 20px;
				margin: 0 0.5rem;
				background: var(--border);
			}
			/* Social icons show in the bar at desktop width; the in-menu copy is
			   hidden until the mobile breakpoint moves them into the dropdown. */
			.bar-social {
				display: inline-flex;
				align-items: center;
			}
			.menu-social {
				display: none;
			}
			@media (max-width: 720px) {
				.menu-btn {
					display: inline-flex;
				}
				.nav-left {
					gap: 0.5rem;
				}
				/* Move the social icons out of the bar and into the menu footer. */
				.bar-social,
				.nav-sep {
					display: none;
				}
				.menu-social {
					display: flex;
					justify-content: start;
					gap: 0.5rem;
					margin-top: 0.5rem;
					padding-top: 0.85rem;
					border-top: 1px solid var(--border);
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
					background: var(--header-bg-solid);
					backdrop-filter: blur(12px);
					border-bottom: 1px solid var(--border);
				}
				.navlinks.open {
					display: flex;
				}
				.navlinks :global(a.nav-link) {
					padding: 0.65rem 1rem;
					border-radius: 12px;
				}
				.nav-sep {
					margin: 0 0.25rem;
				}
			}
			.navlinks :global(a.nav-link) {
				color: var(--text-secondary);
				font-weight: 500;
				padding: 0.4rem 0.9rem;
				border-radius: 9999px;
				transition:
					background 0.15s,
					color 0.15s;
			}
			.navlinks :global(a.nav-link:hover) {
				color: var(--text);
				background: var(--surface);
				text-decoration: none;
			}
			.navlinks :global(a.nav-link[data-status='active']) {
				color: var(--accent-text);
				background: rgba(255, 65, 90, 0.14);
			}
		</style>
	</header>
}
