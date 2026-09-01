// External integrations stay in their own editorial catalog so this directory
// cannot affect the first-party package inventory, counts, or status surfaces.
import { COMMUNITY_BINDING_GROUPS } from '../content/community-bindings.ts';

const COMMUNITY_BINDING_SEARCH_URL = 'https://github.com/search?q=%2F%28%22octane%22%5Cs*%3A%7C%22name%22%5Cs*%3A%5Cs*%22%5B%5E%22%5D*octane%5B%5E%22%5D*%22%29%2F%20path%3A%2Fpackage%5C.json%24%2F%20NOT%20org%3Aoctanejs%20NOT%20is%3Afork&type=code';

export function CommunityBindingsDirectory() @{
	<>
		<ul class="community-binding-list">
			@for (const group of COMMUNITY_BINDING_GROUPS; key group.id) {
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
			}
		</ul>

		<p class="community-binding-discovery-row">
			<a
				class="community-binding-discovery"
				href={COMMUNITY_BINDING_SEARCH_URL}
				target="_blank"
				rel="noreferrer"
				aria-label="Search GitHub for more community bindings in a new tab"
			>
				Search GitHub for more community bindings
			</a>
		</p>

		<style>
			.community-binding-list {
				display: flex;
				flex-wrap: wrap;
				gap: 0.45rem;
				margin: 1.5rem 0;
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
			.community-binding-discovery-row {
				margin: -0.5rem 0 1.5rem;
				font-size: 0.875rem;
			}
		</style>
	</>
}
