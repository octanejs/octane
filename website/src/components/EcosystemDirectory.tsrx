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

interface DirectorySection {
	id: string;
	title: string;
	description: string;
	entities: EcosystemEntity[];
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
	};
}).filter((category) => category.id);
const VALID_CATEGORIES = new Set(CATEGORIES.map((category) => category.id));

function packageRepositoryHref(packageName: string): string {
	return 'https://github.com/octanejs/octane/tree/main/packages/' +
		packageName.slice('@octanejs/'.length);
}

function stringParam(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function directorySections(entities: EcosystemEntity[]): DirectorySection[] {
	const sections: DirectorySection[] = [];
	const integrations = entities.filter((entity) => entity.kind === 'framework-integration');
	if (integrations.length) {
		sections.push({
			id: 'framework-integrations',
			title: 'Framework integrations',
			description: 'Connect Octane to the app framework that owns routing, rendering, and production builds.',
			entities: integrations,
		});
	}
	for (const category of CATEGORIES) {
		const bindings = entities.filter(
			(entity) => entity.kind === 'library-binding' && entity.categoryId === category.id,
		);
		if (bindings.length) sections.push({ ...category, entities: bindings });
	}
	return sections;
}

export function EcosystemDirectory() @{
	const rawSearch = useSearch({ strict: false }) as Record<string, unknown>;
	const navigate = useNavigate();
	const query = stringParam(rawSearch.q);
	const kind =
		rawSearch.kind === 'binding' || rawSearch.kind === 'integration' ? rawSearch.kind : '';
	const category =
		typeof rawSearch.category === 'string' && VALID_CATEGORIES.has(rawSearch.category)
			? rawSearch.category
			: '';
	const filters = { kind, category };
	const searching = query.trim().length >= 2;
	const visible =
		searching
			? searchEcosystem(ENTITIES, query, filters).map((match) => match.entity)
			: filterEcosystemEntities(ENTITIES, filters);
	const sections = directorySections(visible);
	const hasSelection = Boolean(query || kind || category);

	const updateLocation = (
		next: { q?: string; kind?: string; category?: string },
		replace: boolean,
	) => {
		const search: Record<string, string> = {};
		if (next.q) search.q = next.q;
		if (next.kind) search.kind = next.kind;
		if (next.category) search.category = next.category;
		navigate({
			to: '/docs/$slug',
			params: { slug: 'bindings' },
			search,
			hash: undefined,
			replace,
		});
	};

	const onQuery = (event: Event) => {
		updateLocation(
			{
				q: (event.currentTarget as HTMLInputElement).value,
				kind,
				category,
			},
			true,
		);
	};

	const onKind = (event: Event) => {
		const nextKind = (event.currentTarget as HTMLSelectElement).value;
		updateLocation(
			{
				q: query,
				kind: nextKind,
				category: nextKind === 'integration' ? '' : category,
			},
			false,
		);
	};

	const onCategory = (event: Event) => {
		const nextCategory = (event.currentTarget as HTMLSelectElement).value;
		updateLocation(
			{
				q: query,
				kind: nextCategory ? 'binding' : kind,
				category: nextCategory,
			},
			false,
		);
	};

	<div class="ecosystem-directory">
		<div class="ecosystem-controls" role="search" aria-label="Search integrations and bindings">
			<label class="ecosystem-search-field" for="ecosystem-search">
				<span class="ecosystem-control-label">Search packages</span>
				<input
					id="ecosystem-search"
					type="search"
					placeholder="Try “TanStack Router”, “charts”, or “Astro”"
					value={query}
					autoComplete="off"
					spellCheck={false}
					onInput={onQuery}
				/>
			</label>
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
				} @else {
					<span>{visible.length +
						(visible.length === 1 ? ' package' : ' packages') as string}</span>
				}
			</p>
			@if (hasSelection) {
				<button type="button" class="ecosystem-reset" onClick={() => updateLocation({}, false)}>
					Reset search and filters
				</button>
			}
		</div>

		@if (sections.length > 0) {
			<div class="ecosystem-sections">
				@for (const section of sections; key section.id) {
					<section class="ecosystem-section" aria-labelledby={'ecosystem-section-' + section.id}>
						<header class="ecosystem-section-header">
							<div>
								<h3
									id={'ecosystem-section-' + section.id}
									class="ecosystem-section-heading"
								>{section.title as string}</h3>
								<p>{section.description as string}</p>
							</div>
							<span class="ecosystem-count">{section.entities.length + '' as string}</span>
						</header>
						<div class="ecosystem-grid">
							@for (const entity of section.entities; key entity.id) {
								<article id={entity.id} class="ecosystem-entity">
									<div class="ecosystem-entity-copy">
										<span class="ecosystem-type">
											{entity.kind === 'library-binding'
												? 'Library binding'
												: 'Framework integration'}
										</span>
										<h4>{entity.title as string}</h4>
										<code>{entity.packageName as string}</code>
										<p>{entity.description as string}</p>
										<span class="ecosystem-context">
											{entity.kind === 'library-binding'
												? 'Ports ' + entity.upstreamPackage
												: entity.model}
										</span>
									</div>
									<div class="ecosystem-actions">
										<a
											class="ecosystem-package-link"
											href={packageRepositoryHref(entity.packageName)}
										>
											Package guide ↗
										</a>
										@if (entity.kind === 'framework-integration') {
											<a
												class="ecosystem-guide-link"
												href={'/docs/framework-integrations#' + entity.guideAnchor}
											>
												Integration guide
											</a>
										}
									</div>
								</article>
							}
						</div>
					</section>
				}
			</div>
		} @else {
			<div class="ecosystem-empty">
				<strong>No matches</strong>
				<p>Try a package name, broader job, or reset the active filters.</p>
				<button type="button" class="ecosystem-reset" onClick={() => updateLocation({}, false)}>
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
				grid-template-columns: minmax(0, 1fr) 12rem 13rem;
				gap: 0.65rem;
				padding: 0.85rem;
				border: 1px solid var(--border);
				border-radius: 0.9rem;
				background: var(--surface-subtle);
			}
			.ecosystem-search-field,
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
			.ecosystem-controls input,
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
			.ecosystem-controls input:focus,
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
				display: flex;
				flex-direction: column;
				gap: 2rem;
			}
			.ecosystem-section-header {
				display: flex;
				align-items: flex-start;
				justify-content: space-between;
				gap: 1rem;
				margin-bottom: 0.75rem;
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
			.ecosystem-grid {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 0.7rem;
			}
			.ecosystem-entity {
				display: flex;
				flex-direction: column;
				min-width: 0;
				border: 1px solid var(--border);
				border-radius: 0.8rem;
				background: var(--surface-subtle);
				scroll-margin-top: 5.5rem;
				overflow: hidden;
			}
			.ecosystem-entity:target {
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
			.ecosystem-entity h4 {
				margin: 0.55rem 0 0.2rem;
				font-size: 0.98rem;
			}
			.ecosystem-entity code {
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
			.ecosystem-entity .ecosystem-entity-copy p {
				display: -webkit-box;
				overflow: hidden;
				-webkit-box-orient: vertical;
				-webkit-line-clamp: 3;
				margin: 0.65rem 0;
				color: var(--text-secondary);
				font-size: 0.78rem;
				line-height: 1.5;
			}
			.ecosystem-context {
				display: block;
				color: var(--text-secondary);
				font-size: 0.7rem;
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
				.ecosystem-controls {
					grid-template-columns: 1fr 1fr;
				}
				.ecosystem-search-field {
					grid-column: 1 / -1;
				}
			}
			@media (max-width: 600px) {
				.ecosystem-controls,
				.ecosystem-grid {
					grid-template-columns: 1fr;
				}
				.ecosystem-search-field {
					grid-column: auto;
				}
				.ecosystem-entity {
					scroll-margin-top: 9rem;
				}
			}
		</style>
	</div>
}
