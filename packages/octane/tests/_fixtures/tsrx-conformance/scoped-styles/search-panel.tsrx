// The RFC's SearchPanel: a nested scope with setup code owns its own block.
export function SearchPanel({
	filters,
	results,
}: {
	filters: Array<{ label: string }>;
	results: Array<{ title: string }>;
}) @{
	<>
		<style>
			.panel {
				--label: panel;
			}
			/* reaches both lists: this scope and the nested one */
			li {
				list-style: none;
				padding: 0.25rem 0.5rem;
			}
		</style>

		<ul class="filters panel">
			@for (const f of filters) {
				<li class="filter">{f.label}</li>
			}
		</ul>

		@{
			const top = results.slice(0, 10);
			<>
				<style>
					.results {
						--label: results;
					}
					/* reaches only this scope's list, and wins here */
					li {
						padding: 0.75rem 0;
						border-bottom: 1px solid gray;
					}
				</style>
				<ul class="list results">
					@for (const r of top) {
						<li class="result">{r.title}</li>
					}
				</ul>
			</>
		}
	</>
}
