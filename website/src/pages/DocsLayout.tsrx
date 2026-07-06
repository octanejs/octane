// Docs section shell: sidebar of documents (from the registry) + the routed
// document via <Outlet/>.
import { Link, Outlet } from '@octanejs/router';
import { docs } from '../content/docs.ts';

export function DocsLayout() @{
	<div class="docs">
		<aside class="sidebar">
			<nav aria-label="Docs">
				<p class="sidebar-heading">Documentation</p>
				<ul class="sidebar-list">
					@for (const doc of docs; key doc.slug) {
						<li>
							<Link to="/docs/$slug" params={{ slug: doc.slug }} class="sidebar-link">
								{doc.title as string}
							</Link>
						</li>
					}
				</ul>
			</nav>
		</aside>
		<div class="doc-outlet">
			<Outlet />
		</div>
		<style>
			.docs {
				max-width: 1200px;
				margin: 0 auto;
				padding: 0 1.5rem;
				display: grid;
				grid-template-columns: 240px minmax(0, 1fr);
				gap: 3rem;
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
			}
			@media (max-width: 800px) {
				.sidebar {
					position: static;
					padding-top: 1.5rem;
				}
			}
			.sidebar-heading {
				text-transform: uppercase;
				letter-spacing: 0.08em;
				font-size: 0.75rem;
				font-weight: 700;
				color: #99a1b3;
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
				color: #99a1b3;
				font-weight: 500;
				font-size: 0.925rem;
				padding: 0.45rem 0.75rem;
				border-radius: 0.75rem;
				transition:
					background 0.15s,
					color 0.15s;
			}
			.sidebar-list :global(a.sidebar-link:hover) {
				color: #f4eee8;
				background: rgba(255, 255, 255, 0.06);
				text-decoration: none;
			}
			.sidebar-list :global(a.sidebar-link[data-status='active']) {
				color: #ff5d72;
				background: rgba(255, 65, 90, 0.14);
			}
			.doc-outlet {
				min-width: 0;
				padding: 2rem 0 1rem;
			}
		</style>
	</div>
}
