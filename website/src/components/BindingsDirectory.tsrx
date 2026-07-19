// The bindings docs directory. Its editorial groups and package inventory live
// in content/bindings.json so the docs, homepage counts, and status check share
// one site-level source of truth.
import { BINDING_CATEGORIES, bindingRepositoryHref } from '../content/bindings.ts';

export function BindingsDirectory() @{
	<>
		<div class="binding-directory">
			@for (const category of BINDING_CATEGORIES; key category.title) {
				<section class="binding-card">
					<header class="binding-card-head">
						<h3>
							{category.title as string}
						</h3>
						<span class="binding-count">
							{category.packages.length +
								(category.packages.length === 1 ? ' binding' : ' bindings')}
						</span>
					</header>
					<p class="binding-description">
						{category.description as string}
					</p>
					<ul class="binding-list">
						@for (const packageName of category.packages; key packageName) {
							<li>
								<a class="binding-link" href={bindingRepositoryHref(packageName)}>
									<code>
										{packageName as string}
									</code>
								</a>
							</li>
						}
					</ul>
				</section>
			}
		</div>

		<style>
			.binding-directory {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 0.85rem;
				margin: 1.5rem 0;
			}
			.binding-card {
				padding: 1.1rem;
				border: 1px solid var(--border);
				border-radius: 0.9rem;
				background: var(--surface-subtle);
			}
			.binding-card-head {
				display: flex;
				align-items: baseline;
				justify-content: space-between;
				gap: 0.75rem;
				margin-bottom: 0.55rem;
			}
			.binding-card-head h3 {
				margin: 0;
				font-size: 1rem;
			}
			.binding-count {
				flex: none;
				padding: 0.15rem 0.45rem;
				border: 1px solid rgba(255, 93, 114, 0.24);
				border-radius: 999px;
				background: rgba(255, 65, 90, 0.08);
				color: #ff9baa;
				font-size: 0.7rem;
				font-weight: 750;
				letter-spacing: 0.02em;
				white-space: nowrap;
			}
			.binding-card .binding-description {
				margin: 0 0 0.85rem;
				color: var(--text-secondary);
				font-size: 0.82rem;
				line-height: 1.45;
			}
			.binding-list {
				display: flex;
				flex-wrap: wrap;
				gap: 0.45rem;
				list-style: none;
				margin: 0;
				padding: 0;
			}
			.binding-list li {
				margin: 0;
				padding: 0;
			}
			.binding-link {
				display: inline-flex;
				max-width: 100%;
				border: 1px solid var(--border);
				border-radius: 0.5rem;
				background: var(--code-bg);
				text-decoration: none;
				transition:
					border-color 0.15s,
					background 0.15s;
			}
			.binding-link:hover {
				border-color: rgba(255, 93, 114, 0.55);
				background: rgba(255, 65, 90, 0.08);
			}
			.binding-card .binding-link code {
				overflow: hidden;
				max-width: 100%;
				padding: 0.35rem 0.5rem;
				border: 0;
				background: transparent;
				color: #ff8b9b;
				font-size: 0.75rem;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			@media (max-width: 640px) {
				.binding-directory {
					grid-template-columns: 1fr;
				}
			}
		</style>
	</>
}
