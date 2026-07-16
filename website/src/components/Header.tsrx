// The sticky top bar: two clusters — wordmark + section links on the left,
// search and the X/Discord/GitHub icons on the right. Router <Link>s are separate
// components, so their classes are styled through :global() descendant holes.
// Below 720px the left link row collapses behind a hamburger into a dropdown
// panel, while search and the social icons stay in the bar as icons.
import { useState } from 'octane';
import { Link } from '@octanejs/tanstack-router';
import { DocsSearch } from './DocsSearch.tsrx';
import logoUrl from '../assets/octane-logo.svg';
import xUrl from '../assets/x.svg';
import discordUrl from '../assets/discord.svg';
import githubUrl from '../assets/github.svg';

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
					<img src={logoUrl} alt="Octane" class="wordmark-img" width="123" height="30" />
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
				</nav>
			</div>
			<div class="nav-right">
				<DocsSearch />
				<span class="nav-sep" aria-hidden="true"></span>
				<a
					class="nav-icon"
					href="https://x.com/octanejs"
					target="_blank"
					rel="noreferrer"
					title="X"
					aria-label="Octane on X"
				>
					<span
						class="nav-icon-glyph"
						style={'--icon:url("' + xUrl + '")'}
						aria-hidden="true"
					></span>
				</a>
				<a
					class="nav-icon"
					href="https://discord.gg/8puY9fFqd9"
					target="_blank"
					rel="noreferrer"
					title="Discord"
					aria-label="Octane on Discord"
				>
					<span
						class="nav-icon-glyph"
						style={'--icon:url("' + discordUrl + '")'}
						aria-hidden="true"
					></span>
				</a>
				<a
					class="nav-icon"
					href="https://github.com/octanejs/octane"
					target="_blank"
					rel="noreferrer"
					title="GitHub"
					aria-label="Octane on GitHub"
				>
					<span
						class="nav-icon-glyph"
						style={'--icon:url("' + githubUrl + '")'}
						aria-hidden="true"
					></span>
				</a>
			</div>
		</div>
		<style>
			.topnav {
				position: sticky;
				top: 0;
				z-index: 10;
				background: rgba(35, 39, 47, 0.85);
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
				margin-left: -0.5rem;
				border: none;
				border-radius: 10px;
				background: transparent;
				color: var(--text-secondary);
				cursor: pointer;
			}
			.menu-btn:hover {
				color: var(--text);
				background: rgba(255, 255, 255, 0.06);
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
			.nav-icon {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 36px;
				height: 36px;
				border-radius: 9999px;
				color: var(--text-secondary);
				transition:
					background 0.15s,
					color 0.15s;
			}
			.nav-icon:hover {
				color: var(--text);
				background: rgba(255, 255, 255, 0.06);
				text-decoration: none;
			}
			/* The brand svgs live in assets/ and are tinted through a mask, so they
			   still follow the link's currentColor on hover. The url() in --icon
			   MUST stay quoted: vite inlines these as data: URIs whose attributes
			   carry raw ' quotes, which an unquoted url() token cannot hold — the
			   mask would fall back to none and paint a solid box. */
			.nav-icon-glyph {
				width: 20px;
				height: 20px;
				flex: none;
				background: currentColor;
				mask: var(--icon) center / contain no-repeat;
				-webkit-mask: var(--icon) center / contain no-repeat;
			}
			@media (max-width: 720px) {
				.menu-btn {
					display: inline-flex;
				}
				.nav-left {
					gap: 0.5rem;
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
				background: rgba(255, 255, 255, 0.06);
				text-decoration: none;
			}
			.navlinks :global(a.nav-link[data-status='active']) {
				color: var(--accent-text);
				background: rgba(255, 65, 90, 0.14);
			}
		</style>
	</header>
}
