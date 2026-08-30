// One searchable surface for first-party app integrations and library bindings.
// Its state lives in the route search params so SSR, shared URLs, and header
// search land on the same deterministic result set.
import { useNavigate, useSearch } from '@octanejs/tanstack-router';
import { BINDING_CATEGORIES } from '../content/bindings.ts';
import ecosystemIndex from '../content/ecosystem-index.json';
import {
	filterEcosystemEntities,
	searchEcosystem,
	type EcosystemEntity,
} from '../lib/ecosystem-search-core.ts';
import { ecosystemPackageGuideHref } from '../lib/ecosystem-presentation.ts';
import { openDocsSearch } from '../lib/docs-search-events.ts';

interface DirectorySection {
	id: string;
	title: string;
	description: string;
	entities: EcosystemEntity[];
	layout: 'binding-card' | 'mixed';
}

interface DirectoryState {
	q: string;
	kind: string;
	category: string;
}

const ENTITIES = ecosystemIndex as EcosystemEntity[];
const CATEGORIES = BINDING_CATEGORIES.map((category) => {
	const entity = ENTITIES.find(
		(candidate) => candidate.kind === 'library-binding' && candidate.category === category.title,
	);
	return {
		id: entity?.kind === 'library-binding' ? entity.categoryId : '',
		title: category.title,
		description: category.description,
		count: category.packages.length,
	};
}).filter((category) => category.id);
const VALID_CATEGORIES = new Set(CATEGORIES.map((category) => category.id));

function stringParam(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function directoryState(rawSearch: Record<string, unknown>): DirectoryState {
	const kind =
		rawSearch.kind === 'binding' || rawSearch.kind === 'integration' ? rawSearch.kind : '';
	return {
		q: stringParam(rawSearch.q),
		kind,
		category: kind !== 'integration' && typeof rawSearch.category === 'string' &&
		VALID_CATEGORIES.has(rawSearch.category)
			? rawSearch.category
			: '',
	};
}

function searchParams(state: DirectoryState): Record<string, string> {
	const search: Record<string, string> = {};
	if (state.q) search.q = state.q;
	if (state.kind) search.kind = state.kind;
	if (state.category) search.category = state.category;
	return search;
}

function directorySections(entities: EcosystemEntity[], searching: boolean): DirectorySection[] {
	if (searching && entities.length) {
		return [
			{
				id: 'search-results',
				title: 'Search results',
				description: 'Ranked by relevance across integrations and bindings.',
				entities,
				layout: 'mixed',
			},
		];
	}

	const sections: DirectorySection[] = [];
	const integrations = entities.filter((entity) => entity.kind === 'framework-integration');
	if (integrations.length) {
		sections.push({
			id: 'framework-integrations',
			title: 'Framework integrations',
			description: 'Connect Octane to the app framework that owns routing, rendering, and production builds.',
			entities: integrations.sort((left, right) => left.title.localeCompare(right.title)),
			layout: 'binding-card',
		});
	}
	for (const category of CATEGORIES) {
		const bindings = entities.filter(
			(entity) => entity.kind === 'library-binding' && entity.categoryId === category.id,
		).sort((left, right) => left.title.localeCompare(right.title));
		if (bindings.length) sections.push({ ...category, entities: bindings, layout: 'binding-card' });
	}
	return sections;
}

function bindingCount(count: number): string {
	return count + (count === 1 ? ' binding' : ' bindings');
}

function integrationCount(count: number): string {
	return count + (count === 1 ? ' integration' : ' integrations');
}

function sectionCount(section: DirectorySection): string {
	if (section.layout === 'mixed') return section.entities.length + '';
	return section.entities[0]?.kind === 'framework-integration'
		? integrationCount(section.entities.length)
		: bindingCount(section.entities.length);
}

export function EcosystemDirectory() @{
	const rawSearch = useSearch({ strict: false }) as Record<string, unknown>;
	const navigate = useNavigate();
	const { q: query, kind, category } = directoryState(rawSearch);
	const filters = { kind, category };
	const searching = query.trim().length >= 2;
	const queryTooShort = query.trim().length === 1;
	const visible =
		searching
			? searchEcosystem(ENTITIES, query, filters).map((match) => match.entity)
			: filterEcosystemEntities(ENTITIES, filters);
	const sections = directorySections(visible, searching);
	const hasSelection = Boolean(query || kind || category);

	const updateLocation = (
		update: (current: DirectoryState) => DirectoryState,
		replace: boolean,
	) => {
		navigate({
			to: '/docs/$slug',
			params: { slug: 'bindings' },
			search: (previous: Record<string, unknown>) => searchParams(update(directoryState(previous))),
			hash: () => '',
			replace,
		});
	};

	const onKind = (event: Event) => {
		const nextKind = (event.currentTarget as HTMLSelectElement).value;
		updateLocation(
			(current) => ({
				...current,
				kind: nextKind,
				category: nextKind === 'integration' ? '' : current.category,
			}),
			false,
		);
	};

	const onCategory = (event: Event) => {
		const nextCategory = (event.currentTarget as HTMLSelectElement).value;
		updateLocation(
			(current) => ({
				...current,
				kind: nextCategory ? 'binding' : current.kind,
				category: nextCategory,
			}),
			false,
		);
	};

	const reset = () => updateLocation(() => ({ q: '', kind: '', category: '' }), false);

	<div class="ecosystem-directory">
		<div class="ecosystem-controls" role="group" aria-label="Filter integrations and bindings">
			<div class="ecosystem-global-search">
				<p>
					<strong>Looking for a specific package?</strong>
					<span>Search docs, bindings, and integrations from one place.</span>
				</p>
				<button type="button" onClick={openDocsSearch}>
					Search Octane
					<kbd>⌘/Ctrl K</kbd>
				</button>
			</div>
			<label class="ecosystem-select-field" for="ecosystem-kind">
				<span class="ecosystem-control-label">Type</span>
				<select id="ecosystem-kind" value={kind} onChange={onKind}>
					<option value="">Everything</option>
					<option value="integration">Framework integrations</option>
					<option value="binding">Library bindings</option>
				</select>
			</label>
			<label class="ecosystem-select-field" for="ecosystem-category">
				<span class="ecosystem-control-label">Binding category</span>
				<select
					id="ecosystem-category"
					value={category}
					disabled={kind === 'integration'}
					onChange={onCategory}
				>
					<option value="">All categories</option>
					@for (const option of CATEGORIES; key option.id) {
						<option value={option.id}>{option.title as string}</option>
					}
				</select>
			</label>
		</div>

		<div class="ecosystem-results-bar" aria-live="polite">
			<p class="ecosystem-results-summary">
				@if (searching) {
					<span>{visible.length + (visible.length === 1 ? ' result' : ' results') + ' for “' +
						query.trim() +
						'”' as string}</span>
				} @else if (queryTooShort) {
					<span>{visible.length + (visible.length === 1 ? ' package' : ' packages') +
						' · enter at least 2 characters to search' as string}</span>
				} @else {
					<span>{visible.length +
						(visible.length === 1 ? ' package' : ' packages') as string}</span>
				}
			</p>
			@if (hasSelection) {
				<button type="button" class="ecosystem-reset" onClick={reset}>
					Reset search and filters
				</button>
			}
		</div>

		@if (!query && kind !== 'integration' && !category) {
			<nav class="ecosystem-category-jumps" aria-label="Jump to binding category">
				<span class="ecosystem-category-jumps-label">Browse categories</span>
				<div>
					@for (const option of CATEGORIES; key option.id) {
						<a href={'#ecosystem-section-' + option.id}>
							<span>{option.title as string}</span>
							<small>{option.count + '' as string}</small>
						</a>
					}
				</div>
			</nav>
		}

		@if (sections.length > 0) {
			<div class="ecosystem-sections">
				@for (const section of sections; key section.id) {
					<section
						class={'ecosystem-section ecosystem-section--' + section.layout}
						aria-labelledby={'ecosystem-section-' + section.id}
					>
						<header class="ecosystem-section-header">
							<div>
								<h3
									id={'ecosystem-section-' + section.id}
									class="ecosystem-section-heading"
								>{section.title as string}</h3>
								<p>{section.description as string}</p>
							</div>
							<span class="ecosystem-count">{sectionCount(section) as string}</span>
						</header>
						@if (section.layout === 'binding-card') {
							<ul class="binding-list">
								@for (const entity of section.entities; key entity.id) {
									<li
										id={entity.id}
										class={'ecosystem-entity ' +
											(entity.kind === 'library-binding'
												? 'ecosystem-binding-item'
												: 'ecosystem-integration-item')}
										data-binding-title={entity.kind === 'library-binding'
											? entity.title
											: undefined}
									>
										<a
											class="binding-link"
											href={ecosystemPackageGuideHref(entity.packageName)}
											aria-label={'Open the ' + entity.title + ' package guide'}
										>
											<code>{entity.packageName as string}</code>
										</a>
									</li>
								}
							</ul>
						} @else {
							<div class="ecosystem-collection ecosystem-collection--mixed">
								@for (const entity of section.entities; key entity.id) {
									@if (entity.kind === 'library-binding') {
										<article
											id={entity.id}
											class="ecosystem-entity ecosystem-binding-item"
											data-binding-title={entity.title}
										>
											<a
												class="binding-link"
												href={ecosystemPackageGuideHref(entity.packageName)}
												aria-label={'Open the ' + entity.title + ' package guide'}
											>
												<code>{entity.packageName as string}</code>
											</a>
										</article>
									} @else {
										<article id={entity.id} class="ecosystem-entity ecosystem-integration-card">
											<div class="ecosystem-entity-copy">
												<span class="ecosystem-type">{entity.model as string}</span>
												<h4>{entity.title as string}</h4>
												<code>{entity.packageName as string}</code>
												<p>{entity.description as string}</p>
											</div>
											<div class="ecosystem-actions">
												<a
													class="ecosystem-package-link"
													href={ecosystemPackageGuideHref(entity.packageName)}
												>
													Package guide ↗
												</a>
												<a
													class="ecosystem-guide-link"
													href={'/docs/framework-integrations#' + entity.guideAnchor}
												>
													Integration guide
												</a>
											</div>
										</article>
									}
								}
							</div>
						}
					</section>
				}
			</div>
		} @else {
			<div class="ecosystem-empty">
				<strong>No matches</strong>
				<p>Try a package name, broader job, or reset the active filters.</p>
				<button type="button" class="ecosystem-reset" onClick={reset}>
					Show the complete directory
				</button>
			</div>
		}

		<style>
			.ecosystem-directory {
				margin: 1.5rem 0 2rem;
			}
			.ecosystem-controls {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 0.65rem;
				padding: 0.85rem;
				border: 1px solid var(--border);
				border-radius: 0.9rem;
				background: var(--surface-subtle);
			}
			.ecosystem-select-field {
				display: flex;
				flex-direction: column;
				gap: 0.35rem;
				min-width: 0;
			}
			.ecosystem-control-label {
				color: var(--text-secondary);
				font-size: 0.7rem;
				font-weight: 750;
				letter-spacing: 0.04em;
				text-transform: uppercase;
			}
			.ecosystem-global-search {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.75rem;
				grid-column: 1 / -1;
				min-width: 0;
				padding-bottom: 0.75rem;
				border-bottom: 1px solid var(--border);
			}
			.ecosystem-global-search p {
				margin: 0;
				color: var(--text-secondary);
				font-size: 0.8rem;
				line-height: 1.35;
			}
			.ecosystem-global-search strong {
				color: var(--text);
			}
			.ecosystem-global-search p span {
				margin-left: 0.25rem;
			}
			.ecosystem-global-search button {
				display: inline-flex;
				align-items: center;
				gap: 0.5rem;
				flex: none;
				height: 2.6rem;
				padding: 0 0.75rem;
				border: 1px solid var(--border);
				border-radius: 0.6rem;
				background: var(--panel);
				color: var(--text);
				font: inherit;
				font-size: 0.82rem;
				font-weight: 700;
				cursor: pointer;
			}
			.ecosystem-global-search button:hover {
				border-color: rgba(255, 93, 114, 0.55);
				background: rgba(255, 65, 90, 0.08);
			}
			.ecosystem-global-search button:focus-visible {
				outline: 2px solid var(--accent);
				outline-offset: 2px;
			}
			.ecosystem-global-search kbd {
				padding: 0.1rem 0.3rem;
				border: 1px solid var(--border);
				border-radius: 0.3rem;
				color: var(--text-secondary);
				font-family: inherit;
				font-size: 0.65rem;
			}
			.ecosystem-controls select {
				width: 100%;
				height: 2.6rem;
				padding: 0 0.75rem;
				border: 1px solid var(--border);
				border-radius: 0.6rem;
				background: var(--panel);
				color: var(--text);
				font: inherit;
				font-size: 0.85rem;
			}
			.ecosystem-controls select:focus {
				border-color: var(--accent);
				outline: 2px solid rgba(255, 65, 90, 0.2);
				outline-offset: 1px;
			}
			.ecosystem-controls select:disabled {
				opacity: 0.5;
			}
			.ecosystem-results-bar {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
				min-height: 2.8rem;
			}
			.ecosystem-results-bar .ecosystem-results-summary {
				margin: 0;
				color: var(--text-secondary);
				font-size: 0.78rem;
			}
			.ecosystem-reset {
				padding: 0;
				border: 0;
				background: transparent;
				color: var(--accent-text);
				font: inherit;
				font-size: 0.78rem;
				font-weight: 700;
				cursor: pointer;
			}
			.ecosystem-reset:hover {
				text-decoration: underline;
				text-underline-offset: 0.18em;
			}
			.ecosystem-sections {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 0.85rem;
			}
			.ecosystem-category-jumps {
				display: flex;
				align-items: flex-start;
				gap: 0.75rem;
				margin: 0 0 1.75rem;
				padding: 0.75rem 0;
				border-block: 1px solid var(--border);
			}
			.ecosystem-category-jumps-label {
				flex: none;
				padding-top: 0.28rem;
				color: var(--text-secondary);
				font-size: 0.7rem;
				font-weight: 750;
				letter-spacing: 0.04em;
				text-transform: uppercase;
			}
			.ecosystem-category-jumps > div {
				display: flex;
				flex-wrap: wrap;
				gap: 0.35rem;
			}
			.ecosystem-category-jumps a {
				display: inline-flex;
				align-items: center;
				gap: 0.38rem;
				padding: 0.25rem 0.5rem;
				border-radius: 999px;
				background: var(--surface-subtle);
				color: var(--text-secondary);
				font-size: 0.72rem;
				font-weight: 650;
				text-decoration: none;
			}
			.ecosystem-category-jumps a:hover {
				background: rgba(255, 65, 90, 0.1);
				color: var(--accent-text);
			}
			.ecosystem-category-jumps small {
				color: var(--danger-text);
				font-size: 0.65rem;
			}
			.ecosystem-section-header {
				display: flex;
				align-items: flex-start;
				justify-content: space-between;
				gap: 1rem;
				margin-bottom: 0.75rem;
			}
			.ecosystem-section--mixed {
				grid-column: 1 / -1;
			}
			.ecosystem-section--binding-card {
				padding: 1.1rem;
				border: 1px solid var(--border);
				border-radius: 0.9rem;
				background: var(--surface-subtle);
			}
			.ecosystem-section--binding-card .ecosystem-section-header {
				align-items: baseline;
				margin-bottom: 0.55rem;
			}
			.ecosystem-section--binding-card .ecosystem-section-header > div {
				min-width: 0;
			}
			.ecosystem-section--binding-card .ecosystem-section-header p {
				margin: 0.55rem 0 0;
				font-size: 0.82rem;
				line-height: 1.45;
			}
			.ecosystem-section-header .ecosystem-section-heading {
				margin: 0;
				font-size: 1.05rem;
			}
			.ecosystem-section-header p {
				margin: 0.35rem 0 0;
				color: var(--text-secondary);
				font-size: 0.8rem;
				line-height: 1.5;
			}
			.ecosystem-count {
				flex: none;
				min-width: 1.8rem;
				padding: 0.15rem 0.45rem;
				border: 1px solid rgba(255, 93, 114, 0.24);
				border-radius: 999px;
				background: rgba(255, 65, 90, 0.08);
				color: var(--danger-text);
				font-size: 0.7rem;
				font-weight: 750;
				text-align: center;
			}
			.ecosystem-collection--mixed {
				display: flex;
				align-items: flex-start;
				flex-wrap: wrap;
				gap: 0.45rem;
			}
			.ecosystem-collection--mixed .ecosystem-integration-card {
				flex: 1 0 100%;
			}
			.ecosystem-entity {
				scroll-margin-top: 5.5rem;
			}
			.ecosystem-integration-card {
				display: flex;
				flex-direction: column;
				min-width: 0;
				border: 1px solid var(--border);
				border-radius: 0.8rem;
				background: var(--surface-subtle);
				overflow: hidden;
			}
			.ecosystem-integration-card:target {
				border-color: var(--accent);
				box-shadow: 0 0 0 3px rgba(255, 65, 90, 0.14);
			}
			.ecosystem-entity-copy {
				flex: 1;
				padding: 0.9rem;
			}
			.ecosystem-type {
				display: inline-flex;
				padding: 0.12rem 0.4rem;
				border: 1px solid rgba(255, 93, 114, 0.24);
				border-radius: 999px;
				color: var(--danger-text);
				font-size: 0.65rem;
				font-weight: 750;
				letter-spacing: 0.035em;
				text-transform: uppercase;
			}
			.ecosystem-integration-card h4 {
				margin: 0.55rem 0 0.2rem;
				font-size: 0.98rem;
			}
			.ecosystem-integration-card code {
				display: block;
				overflow: hidden;
				padding: 0;
				border: 0;
				background: transparent;
				color: var(--accent-text);
				font-size: 0.73rem;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			.ecosystem-integration-card .ecosystem-entity-copy p {
				display: -webkit-box;
				overflow: hidden;
				-webkit-box-orient: vertical;
				-webkit-line-clamp: 3;
				margin: 0.65rem 0;
				color: var(--text-secondary);
				font-size: 0.78rem;
				line-height: 1.5;
			}
			.ecosystem-actions {
				display: flex;
				flex-wrap: wrap;
				gap: 0.25rem;
				padding: 0.45rem;
				border-top: 1px solid var(--border);
				background: var(--panel);
			}
			.ecosystem-actions a {
				padding: 0.3rem 0.45rem;
				border-radius: 0.4rem;
				font-size: 0.72rem;
				font-weight: 700;
				text-decoration: none;
			}
			.ecosystem-actions a:hover {
				background: rgba(255, 65, 90, 0.1);
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
				text-decoration: none;
			}
			.binding-link:focus-visible {
				outline: 2px solid var(--accent);
				outline-offset: 2px;
			}
			.ecosystem-binding-item:target .binding-link,
			.ecosystem-integration-item:target .binding-link {
				border-color: var(--accent);
				box-shadow: 0 0 0 3px rgba(255, 65, 90, 0.14);
			}
			.ecosystem-directory .binding-link code {
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
			.ecosystem-empty {
				padding: 2rem 1rem;
				border: 1px dashed var(--border);
				border-radius: 0.9rem;
				text-align: center;
			}
			.ecosystem-empty p {
				margin: 0.35rem 0 0.9rem;
				color: var(--text-secondary);
			}
			@media (max-width: 760px) {
				.ecosystem-sections {
					grid-template-columns: 1fr;
				}
				.ecosystem-controls {
					grid-template-columns: 1fr 1fr;
				}
				.ecosystem-category-jumps {
					flex-direction: column;
					gap: 0.45rem;
				}
			}
			@media (max-width: 600px) {
				.ecosystem-controls {
					grid-template-columns: 1fr;
				}
				.ecosystem-global-search {
					align-items: flex-start;
					flex-direction: column;
				}
				.ecosystem-global-search button {
					width: 100%;
					justify-content: space-between;
				}
				.ecosystem-entity {
					scroll-margin-top: 9rem;
				}
			}
		</style>
	</div>
}
