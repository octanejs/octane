// Docs section shell: sidebar of documents (from the registry) + the routed
// document via <Outlet/>.
import { Link, Outlet, useParams } from '@octanejs/tanstack-router';
import { useState } from 'octane';
import { OnThisPage } from '../components/OnThisPage.tsrx';
import { docGroups, defaultDoc, findDoc } from '../content/docs.ts';

export function DocsLayout() @{
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const closeMobileNavigation = () => {
		if (!mobileMenuOpen) return;
		setMobileMenuOpen(false);
		// Reveal the target only after the overlay has closed. A timer also covers
		// browsers that omit transitionend.
		const reduce =
			typeof window.matchMedia === 'function' &&
				window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		return new Promise<void>((resolve) => window.setTimeout(resolve, reduce ? 0 : 240));
	};

	// The Link's own data-status covers `/docs/$slug`, but the bare `/docs` index
	// renders the default doc (quick-start) without a slug in the URL — so no link
	// matches and the sidebar reads as inactive. Mark the default doc active there.
	const params = useParams({ strict: false }) as { slug?: string };
	const indexActive = (slug: string) => !params.slug && slug === defaultDoc.slug;
	const activeDoc = findDoc(params.slug);
	const pageActive = (slug: string) => activeDoc?.slug === slug;

	<div class="docs">
		<aside class="sidebar" data-scroll-spy-mobile-host>
			<button
				type="button"
				class="sidebar-mobile-toggle"
				aria-expanded={mobileMenuOpen}
				aria-controls="docs-sidebar-nav"
				onClick={() => setMobileMenuOpen((open) => !open)}
			>
				<span>Documentation</span>
				<span class="sidebar-mobile-icon" aria-hidden="true">+</span>
			</button>
			<div class={['sidebar-panel', mobileMenuOpen && 'is-open']}>
				<div class="sidebar-panel-inner">
					<nav id="docs-sidebar-nav" class="sidebar-nav" aria-label="Documentation">
						<p class="sidebar-title">Documentation</p>
						<div class="sidebar-groups">
							@for (const group of docGroups; key group.title) {
								<div class="sidebar-group">
									<p class="sidebar-heading">
										{group.title as string}
									</p>
									<ul class="sidebar-list">
										@for (const doc of group.docs; key doc.slug) {
											<li>
												<Link
													to="/docs/$slug"
													params={{ slug: doc.slug }}
													class={['sidebar-link', indexActive(doc.slug) && 'is-active']}
													onClick={() => {
														void closeMobileNavigation();
													}}
												>
													{doc.title as string}
												</Link>
												@if (pageActive(doc.slug) && doc.sections && doc.sections.length > 0) {
													<OnThisPage
														sections={doc.sections}
														resetKey={doc.slug}
														onNavigate={closeMobileNavigation}
													/>
												}
											</li>
										}
									</ul>
								</div>
							}
						</div>
					</nav>
				</div>
			</div>
		</aside>
		<div class="doc-outlet">
			<Outlet />
		</div>
		<style>
			.docs {
				max-width: 1420px;
				margin: 0 auto;
				padding: 0 1.5rem;
				display: grid;
				grid-template-columns: 220px minmax(0, 1fr);
				gap: clamp(2rem, 4vw, 4rem);
				align-items: start;
			}
			@media (max-width: 800px) {
				.docs {
					grid-template-columns: 1fr;
					gap: 1rem;
				}
			}
			.sidebar {
				position: sticky;
				top: 76px;
				padding-top: 2rem;
				max-height: calc(100vh - 92px);
				overflow-y: auto;
				scrollbar-width: thin;
			}
			.sidebar-mobile-toggle {
				display: none;
			}
			@media (max-width: 800px) {
				.sidebar {
					position: sticky;
					top: var(--topnav-height);
					z-index: 9;
					max-height: none;
					margin: 0 -1.5rem;
					padding: 0.75rem 1.5rem;
					overflow: visible;
					background: var(--bg);
					border-bottom: 1px solid var(--border);
				}
				.sidebar-mobile-toggle {
					display: flex;
					align-items: center;
					justify-content: space-between;
					width: 100%;
					min-height: 2.5rem;
					padding: 0;
					border: 0;
					background: transparent;
					color: var(--text);
					font-size: 0.9rem;
					font-weight: 750;
					cursor: pointer;
				}
				.sidebar-mobile-icon {
					color: var(--accent-text);
					font-size: 1.15rem;
					transition: transform 0.2s ease;
				}
				.sidebar-mobile-toggle[aria-expanded='true'] .sidebar-mobile-icon {
					transform: rotate(45deg);
				}
				.sidebar-panel {
					position: absolute;
					top: 100%;
					left: 0;
					right: 0;
					display: grid;
					grid-template-rows: 0fr;
					opacity: 0;
					visibility: hidden;
					background: var(--header-bg-solid);
					backdrop-filter: blur(12px);
					border-bottom: 1px solid var(--border);
					transition:
						grid-template-rows 0.22s cubic-bezier(0.22, 0.61, 0.36, 1),
						opacity 0.18s ease,
						visibility 0s 0.22s;
				}
				.sidebar-panel.is-open {
					grid-template-rows: 1fr;
					opacity: 1;
					visibility: visible;
					transition-delay: 0s;
				}
				.sidebar-panel-inner {
					min-height: 0;
					max-height: calc(100dvh - var(--topnav-height) - 5rem);
					overflow: hidden;
				}
				.sidebar-panel.is-open .sidebar-panel-inner {
					overflow-y: auto;
					overscroll-behavior: contain;
					scrollbar-width: thin;
				}
				.sidebar-nav {
					margin-top: 0;
					padding: 0.9rem 1.5rem 0.75rem;
					border-top: 0;
				}
				.sidebar .sidebar-title {
					display: none;
				}
				.sidebar .sidebar-groups {
					display: grid;
					grid-template-columns: repeat(2, minmax(0, 1fr));
					gap: 1rem;
				}
			}
			@media (prefers-reduced-motion: reduce) {
				.sidebar-mobile-icon,
				.sidebar-panel {
					transition: none;
				}
			}
			@media (max-width: 560px) {
				.sidebar .sidebar-groups {
					grid-template-columns: 1fr;
				}
			}
			.sidebar-title {
				margin: 0 0 1rem;
				padding: 0 0.75rem;
				color: var(--text);
				font-size: 0.95rem;
				font-weight: 750;
			}
			.sidebar-groups {
				display: flex;
				flex-direction: column;
				gap: 1.25rem;
			}
			.sidebar-heading {
				text-transform: uppercase;
				letter-spacing: 0.08em;
				font-size: 0.7rem;
				font-weight: 700;
				color: var(--text-secondary);
				margin: 0 0 0.5rem;
				padding: 0 0.75rem;
			}
			.sidebar-list {
				list-style: none;
				margin: 0;
				padding: 0;
				display: flex;
				flex-direction: column;
				gap: 0.125rem;
			}
			.sidebar-list :global(a.sidebar-link) {
				display: block;
				color: var(--text-secondary);
				font-weight: 500;
				font-size: 0.925rem;
				padding: 0.45rem 0.75rem;
				border-radius: 0.75rem;
				transition:
					background 0.15s,
					color 0.15s;
			}
			.sidebar-list :global(a.sidebar-link:hover) {
				color: var(--text);
				background: var(--surface);
				text-decoration: none;
			}
			.sidebar-list :global(a.sidebar-link[data-status='active']),
			.sidebar-list :global(a.sidebar-link.is-active) {
				color: var(--accent-text);
				background: rgba(255, 65, 90, 0.14);
			}
			.doc-outlet {
				min-width: 0;
				padding: 2rem 0 1rem;
			}
			@media (max-width: 800px) {
				.doc-outlet {
					padding-top: 0.75rem;
				}
			}
		</style>
	</div>
}
