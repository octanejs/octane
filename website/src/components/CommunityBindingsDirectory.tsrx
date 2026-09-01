// External integrations stay in their own editorial catalog so this directory
// cannot affect the first-party package inventory, counts, or status surfaces.
import { COMMUNITY_BINDING_GROUPS } from '../content/community-bindings.ts';

export function CommunityBindingsDirectory() @{
	<div class="community-binding-directory">
		@for (const group of COMMUNITY_BINDING_GROUPS; key group.id) {
			<section
				class="community-binding-card"
				aria-labelledby={'community-binding-group-' + group.id}
			>
				<h3 id={'community-binding-group-' + group.id}>{group.title as string}</h3>
				<ul class="community-binding-list">
					@for (const entry of group.entries; key entry.id) {
						<li id={'community-binding-' + entry.id}>
							<a
								class="community-binding-link"
								href={entry.destination}
								target="_blank"
								rel="noreferrer"
								aria-label={`Open ${entry.name} official documentation in a new tab`}
							>
								<code>{entry.searchNames[0] as string}</code>
							</a>
						</li>
					}
				</ul>
			</section>
		}

		<style>
			.community-binding-directory {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
				gap: 0.75rem;
				margin: 1.5rem 0;
			}
			.community-binding-card {
				margin: 0;
				padding: 0.9rem;
				border: 1px solid var(--border);
				border-radius: 0.75rem;
				background: var(--surface-subtle);
			}
			.community-binding-card > h3 {
				margin: 0 0 0.75rem;
				font-size: 0.86rem;
			}
			.community-binding-list {
				display: flex;
				flex-wrap: wrap;
				gap: 0.45rem;
				margin: 0;
				padding: 0;
				list-style: none;
			}
			.community-binding-list li {
				margin: 0;
				padding: 0;
			}
			.community-binding-link {
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
			.community-binding-link:hover {
				border-color: rgba(255, 93, 114, 0.55);
				background: rgba(255, 65, 90, 0.08);
				text-decoration: none;
			}
			.community-binding-link:focus-visible {
				outline: 2px solid var(--accent);
				outline-offset: 2px;
			}
			.community-binding-link code {
				overflow: hidden;
				max-width: 100%;
				padding: 0.35rem 0.5rem;
				border: 0;
				background: transparent;
				color: var(--accent-text);
				font-size: 0.75rem;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
		</style>
	</div>
}
