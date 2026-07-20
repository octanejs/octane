// Docs section shell: sidebar of documents (from the registry) + the routed
// document via <Outlet/>.
import { Link, Outlet, useParams } from '@tanstack/octane-router';
import { docGroups, defaultDoc } from '../content/docs.ts';

export function DocsLayout() @{
	const closeMobileNavigation = (event: Event) => {
		const link = event.currentTarget as HTMLAnchorElement;
		link.closest('details')?.removeAttribute('open');
	};

	// The Link's own data-status covers `/docs/$slug`, but the bare `/docs` index
	// renders the default doc (quick-start) without a slug in the URL — so no link
	// matches and the sidebar reads as inactive. Mark the default doc active there.
	const params = useParams({ strict: false }) as { slug?: string };
	const indexActive = (slug: string) => !params.slug && slug === defaultDoc.slug;

	<div class="docs">
		<aside class="sidebar">
			<nav class="sidebar-nav" aria-label="Docs">
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
										>
											{doc.title as string}
										</Link>
									</li>
								}
							</ul>
						</div>
					}
				</div>
			</nav>
			<details class="sidebar-mobile">
				<summary>
					<span>Documentation</span>
					<span class="sidebar-mobile-icon" aria-hidden="true">+</span>
				</summary>
				<nav aria-label="Docs mobile">
					<div class="mobile-sidebar-groups">
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
												onClick={closeMobileNavigation}
											>
												{doc.title as string}
											</Link>
										</li>
									}
								</ul>
							</div>
						}
					</div>
				</nav>
			</details>
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
			.sidebar-mobile {
				display: none;
			}
			@media (max-width: 800px) {
				.sidebar {
					position: static;
					max-height: none;
					margin: 0 -1.5rem;
					padding: 0.75rem 1.5rem;
					overflow: hidden;
					border-bottom: 1px solid var(--border);
				}
				.sidebar-nav {
					display: none;
				}
				.sidebar-mobile {
					display: block;
				}
				.sidebar-mobile summary {
					display: flex;
					align-items: center;
					justify-content: space-between;
					min-height: 2.5rem;
					color: var(--text);
					font-size: 0.9rem;
					font-weight: 750;
					cursor: pointer;
					list-style: none;
				}
				.sidebar-mobile summary::-webkit-details-marker {
					display: none;
				}
				.sidebar-mobile-icon {
					color: var(--accent-text);
					font-size: 1.15rem;
					transition: transform 0.15s;
				}
				.sidebar-mobile[open] .sidebar-mobile-icon {
					transform: rotate(45deg);
				}
				.sidebar-mobile nav {
					margin-top: 0.5rem;
					padding-top: 0.9rem;
					border-top: 1px solid var(--border);
				}
				.mobile-sidebar-groups {
					display: grid;
					grid-template-columns: repeat(2, minmax(0, 1fr));
					gap: 1rem;
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
