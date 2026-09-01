// External integrations stay in their own editorial catalog so this directory
// cannot affect the first-party package inventory, counts, or status surfaces.
import { COMMUNITY_BINDING_GROUPS } from '../content/community-bindings.ts';

export function CommunityBindingsDirectory() @{
	<div class="community-binding-directory">
		@for (const group of COMMUNITY_BINDING_GROUPS; key group.id) {
			<section
				class="community-binding-group"
				aria-labelledby={`community-binding-group-${group.id}`}
			>
				<h3 id={`community-binding-group-${group.id}`}>{group.title as string}</h3>
				<ul class="community-binding-list">
					@for (const entry of group.entries; key entry.id) {
						<li class="community-binding-entry">
							<div class="community-binding-identity">
								<h4 class="community-binding-name">{entry.name as string}</h4>
								<span class="community-binding-owner">{'By ' + entry.owner}</span>
							</div>
							<p class="community-binding-purpose">{entry.purpose as string}</p>
							<a
								class="community-binding-link"
								href={entry.destination}
								aria-label={`Open ${entry.name} official documentation`}
							>
								Official docs
								<span aria-hidden="true">↗</span>
							</a>
						</li>
					}
				</ul>
			</section>
		}

		<style>
			.community-binding-directory {
				display: grid;
				gap: 0.85rem;
				margin: 1.5rem 0;
			}
			.community-binding-group {
				overflow: hidden;
				border: 1px solid var(--border);
				border-radius: 0.9rem;
				background: var(--surface-subtle);
			}
			.community-binding-group > h3 {
				margin: 0;
				padding: 0.8rem 1rem;
				border-bottom: 1px solid var(--border);
				font-size: 0.92rem;
			}
			.community-binding-list {
				margin: 0;
				padding: 0;
				list-style: none;
			}
			.community-binding-entry {
				display: grid;
				grid-template-columns: minmax(9rem, 0.8fr) minmax(0, 1.8fr) auto;
				align-items: center;
				gap: 0.8rem 1rem;
				margin: 0;
				padding: 0.8rem 1rem;
			}
			.community-binding-entry + .community-binding-entry {
				border-top: 1px solid var(--border);
			}
			.community-binding-identity {
				min-width: 0;
			}
			.community-binding-name {
				margin: 0;
				color: var(--text);
				font-size: 0.84rem;
				line-height: 1.35;
			}
			.community-binding-owner {
				display: block;
				margin-top: 0.16rem;
				color: var(--text-secondary);
				font-size: 0.7rem;
				line-height: 1.35;
			}
			.community-binding-purpose {
				margin: 0;
				color: var(--text-secondary);
				font-size: 0.78rem;
				line-height: 1.45;
			}
			.community-binding-link {
				display: inline-flex;
				align-items: center;
				gap: 0.3rem;
				color: var(--accent-text);
				font-size: 0.75rem;
				font-weight: 700;
				text-decoration: none;
				white-space: nowrap;
			}
			.community-binding-link:hover {
				color: var(--accent-hover);
				text-decoration: underline;
				text-underline-offset: 0.2em;
			}
			.community-binding-link:focus-visible {
				border-radius: 0.2rem;
				outline: 2px solid var(--accent-hover);
				outline-offset: 3px;
			}
			@media (max-width: 640px) {
				.community-binding-entry {
					grid-template-columns: 1fr;
					gap: 0.55rem;
				}
				.community-binding-link {
					justify-self: start;
				}
			}
		</style>
	</div>
}
