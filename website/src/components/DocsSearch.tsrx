// Site search keeps the established header entry point and docs snippets, then
// adds typed ecosystem results from the generated browser index.
import { createPortal, useEffect, useRef, useState } from 'octane';
import { useNavigate } from '@octanejs/tanstack-router';
import {
	loadSiteSearchIndex,
	searchSite,
	type SiteSearchIndex,
	type SiteSearchResult,
} from '../lib/site-search.ts';
import type { EcosystemEntity } from '../lib/ecosystem-search-core.ts';
import {
	ecosystemEntityTypeLabel,
	ecosystemPackageGuideHref,
} from '../lib/ecosystem-presentation.ts';
import type { SearchGroup } from '../lib/docs-search-core.ts';
import searchUrl from '../assets/search.svg';
import { DOCS_SEARCH_OPEN_EVENT, type DocsSearchOpenDetail } from '../lib/docs-search-events.ts';

interface DialogProps {
	onClose: () => void;
}

function scrollToAnchor(id: string) {
	let frames = 0;
	const reveal = () => {
		const element = document.getElementById(id);
		if (element) element.scrollIntoView({ block: 'start' });
		else if (frames++ < 120) requestAnimationFrame(reveal);
	};
	requestAnimationFrame(reveal);
}

function SearchDialog(props: DialogProps) @{
	const [query, setQuery] = useState('');
	const [active, setActive] = useState(0);
	const [index, setIndex] = useState<SiteSearchIndex | null>(null);
	const [indexFailed, setIndexFailed] = useState(false);
	const [loadAttempt, setLoadAttempt] = useState(0);
	const inputEl = useRef<HTMLInputElement | null>(null);
	const navigate = useNavigate();
	const results: SiteSearchResult[] =
		index ? searchSite(index, query) : [];

	useEffect(() => {
		let live = true;
		loadSiteSearchIndex().then(
			(loaded) => {
				if (!live) return;
				setIndex(loaded);
				setIndexFailed(false);
			},
			() => {
				if (live) setIndexFailed(true);
			},
		);
		inputEl.current?.focus();
		return () => {
			live = false;
		};
	}, [loadAttempt]);

	useEffect(() => {
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

	let targetCount = 0;
	const nextRow = () => targetCount++;
	const board = results.map((result) => {
		if (result.type === 'docs') {
			const group = result.group;
			const headRow = nextRow();
			const lines = group.lines.map(
				(line) => ({
					...line,
					row: nextRow(),
				}),
			);
			return {
				type: 'docs' as const,
				key: 'docs:' + group.key,
				crumb: 'Docs › ' + group.docTitle,
				title: group.id ? group.title : group.docTitle,
				headRow,
				lines,
				group,
			};
		}

		const entity = result.match.entity;
		const primaryRow = nextRow();
		const packageRow = nextRow();
		const guideRow =
			entity.kind === 'framework-integration' ? nextRow() : undefined;
		return {
			type: 'entity' as const,
			key: 'entity:' + entity.id,
			entity,
			primaryRow,
			packageRow,
			guideRow,
		};
	});

	const goToDocs = (group: SearchGroup) => {
		props.onClose();
		const navigation = navigate({
			to: '/docs/$slug',
			params: { slug: group.slug },
			hash: group.id || undefined,
		});
		if (group.id) void navigation.then(() => scrollToAnchor(group.id));
	};

	const goToEntity = (entity: EcosystemEntity) => {
		props.onClose();
		void navigate({
			to: '/docs/$slug',
			params: { slug: 'bindings' },
			search: {
				q: entity.title,
				kind: entity.kind === 'library-binding' ? 'binding' : 'integration',
			},
			hash: entity.id,
		}).then(() => scrollToAnchor(entity.id));
	};

	const goToIntegrationGuide = (entity: EcosystemEntity, event: Event) => {
		event.preventDefault();
		if (entity.kind !== 'framework-integration') return;
		props.onClose();
		void navigate({
			to: '/docs/$slug',
			params: { slug: 'framework-integrations' },
			hash: entity.guideAnchor,
		}).then(() => scrollToAnchor(entity.guideAnchor));
	};

	const reveal = (row: number) => {
		requestAnimationFrame(() => {
			document.querySelector('[data-search-row="' + row + '"]')?.scrollIntoView({
				block: 'nearest',
			});
		});
	};

	const step = (delta: number) => {
		const count = targetCount;
		if (!count) return;
		setActive((current) => {
			const next = (current + delta + count) % count;
			reveal(next);
			return next;
		});
	};

	const activate = (row: number) => {
		(document.querySelector('[data-search-row="' + row + '"]') as HTMLElement | null)?.click();
	};

	const onQuery = (event: Event) => {
		const value = (event.currentTarget as HTMLInputElement).value;
		setQuery(value);
		setActive(0);
	};

	const retryIndex = () => {
		setIndex(null);
		setIndexFailed(false);
		setLoadAttempt((attempt) => attempt + 1);
	};

	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			props.onClose();
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			step(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			step(-1);
		} else if (event.key === 'Enter' && active < targetCount) {
			event.preventDefault();
			activate(active);
		}
	};

	<div class="search-overlay" onClick={props.onClose} onKeyDown={onKeyDown}>
		<div
			class="search-panel"
			role="dialog"
			aria-modal="true"
			aria-label="Search docs, packages, and integrations"
			onClick={(event: Event) => event.stopPropagation()}
		>
			<div class="search-field">
				<span
					class="search-field-icon"
					style={'--icon:url("' + searchUrl + '")'}
					aria-hidden="true"
				></span>
				<input
					ref={inputEl}
					type="search"
					class="search-input"
					placeholder="Search docs, packages, and integrations"
					aria-label="Search docs, packages, and integrations"
					autoComplete="off"
					spellCheck={false}
					value={query}
					onInput={onQuery}
				/>
				<kbd class="search-esc">ESC</kbd>
			</div>

			@if (board.length > 0) {
				<div class="search-board" role="listbox">
					@for (const card of board; key card.key) {
						@if (card.type === 'entity') {
							<article class="search-entity">
								<button
									type="button"
									class={['search-entity-primary', card.primaryRow === active && 'active']}
									role="option"
									aria-selected={card.primaryRow === active}
									aria-label={'View ' + card.entity.title + ' in the ecosystem directory'}
									data-search-row={card.primaryRow}
									onMouseEnter={() => setActive(card.primaryRow)}
									onFocus={() => setActive(card.primaryRow)}
									onClick={() => goToEntity(card.entity)}
								>
									<span class="search-type">{ecosystemEntityTypeLabel(card.entity) as string}</span>
									<span class="search-title">{card.entity.title as string}</span>
									<code class="search-package">{card.entity.packageName as string}</code>
									<span class="search-context">
										{card.entity.kind === 'library-binding'
											? 'Ports ' + card.entity.upstreamPackage + ' · ' + card.entity.category
											: card.entity.model}
									</span>
								</button>
								<div class="search-entity-actions">
									<a
										class={[
											'search-entity-action',
											'search-entity-package',
											card.packageRow === active && 'active',
										]}
										href={ecosystemPackageGuideHref(card.entity.packageName)}
										role="option"
										aria-selected={card.packageRow === active}
										aria-label={'Open the ' + card.entity.title + ' package guide'}
										data-search-row={card.packageRow}
										onMouseEnter={() => setActive(card.packageRow)}
										onFocus={() => setActive(card.packageRow)}
									>
										Package guide ↗
									</a>
									@if (
										card.entity.kind === 'framework-integration' && card.guideRow !== undefined
									) {
										<a
											class={[
												'search-entity-action',
												'search-entity-guide',
												card.guideRow === active && 'active',
											]}
											href={'/docs/framework-integrations#' + card.entity.guideAnchor}
											role="option"
											aria-selected={card.guideRow === active}
											aria-label={'Open the ' + card.entity.title + ' integration guide'}
											data-search-row={card.guideRow}
											onMouseEnter={() => setActive(card.guideRow as number)}
											onFocus={() => setActive(card.guideRow as number)}
											onClick={(event: Event) => goToIntegrationGuide(card.entity, event)}
										>
											Integration guide
										</a>
									}
								</div>
							</article>
						} @else {
							<div class="search-card">
								<button
									type="button"
									class={['search-head', card.headRow === active && 'active']}
									role="option"
									aria-selected={card.headRow === active}
									data-search-row={card.headRow}
									onMouseEnter={() => setActive(card.headRow)}
									onFocus={() => setActive(card.headRow)}
									onClick={() => goToDocs(card.group)}
								>
									<span class="search-crumb">{card.crumb as string}</span>
									<span class="search-title">{card.title as string}</span>
								</button>
								@if (card.lines.length > 0) {
									<div class="search-lines">
										@for (const line of card.lines; key line.key) {
											<button
												type="button"
												class={[
													'search-line',
													line.code && 'code',
													line.row === active && 'active',
												]}
												role="option"
												aria-selected={line.row === active}
												data-search-row={line.row}
												onMouseEnter={() => setActive(line.row)}
												onFocus={() => setActive(line.row)}
												onClick={() => goToDocs(card.group)}
											>
												@for (const part of line.parts; key part.i) {
													@if (part.hit) {
														<mark>{part.text as string}</mark>
													} @else {
														<span>{part.text as string}</span>
													}
												}
											</button>
										}
									</div>
								}
							</div>
						}
					}
				</div>
			} @else {
				<div class="search-empty">
					@if (indexFailed) {
						<>
							<span>Search could not load.</span>
							<button type="button" class="search-retry" onClick={retryIndex}>Retry</button>
						</>
					} @else if (!index) {
						<span>Loading the search index…</span>
					} @else {
						@if (query.trim().length < 2) {
							<span>Search the docs, packages, and integrations.</span>
						} @else {
							<span>{'No matches for “' + query.trim() + '”.'}</span>
						}
					}
				</div>
			}
		</div>

		<style>
			.search-overlay {
				position: fixed;
				inset: 0;
				z-index: 50;
				display: flex;
				justify-content: center;
				align-items: flex-start;
				padding: 10vh 1rem 1rem;
				background: rgba(12, 14, 18, 0.72);
				backdrop-filter: blur(3px);
			}
			.search-panel {
				width: min(720px, 100%);
				max-height: 76vh;
				display: flex;
				flex-direction: column;
				background: var(--panel);
				border: 1px solid var(--border);
				border-radius: 1rem;
				box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
				overflow: hidden;
			}
			.search-field {
				display: flex;
				align-items: center;
				gap: 0.75rem;
				padding: 0.9rem 1rem;
				border-bottom: 1px solid var(--border);
			}
			.search-field-icon {
				width: 18px;
				height: 18px;
				flex: none;
				background: var(--text-secondary);
				mask: var(--icon) center / contain no-repeat;
				-webkit-mask: var(--icon) center / contain no-repeat;
			}
			.search-input {
				flex: 1;
				min-width: 0;
				border: none;
				background: transparent;
				color: var(--text);
				font: inherit;
				font-size: 1rem;
				outline: none;
			}
			.search-input::-webkit-search-cancel-button {
				display: none;
			}
			.search-esc {
				flex: none;
				padding: 0.2rem 0.45rem;
				border: 1px solid var(--border);
				border-radius: 0.4rem;
				color: var(--text-secondary);
				font-size: 0.7rem;
				font-family: inherit;
				letter-spacing: 0.04em;
			}
			.search-board {
				display: flex;
				flex-direction: column;
				gap: 0.5rem;
				padding: 0.5rem;
				overflow: auto;
				overflow-x: hidden;
				scrollbar-width: none;
			}
			.search-board::-webkit-scrollbar {
				display: none;
			}
			.search-card,
			.search-entity {
				display: flex;
				flex-direction: column;
				flex-shrink: 0;
				min-width: 0;
			}
			.search-entity {
				border: 1px solid var(--border);
				border-radius: 0.8rem;
				overflow: hidden;
			}
			.search-entity-primary,
			.search-head,
			.search-line {
				display: block;
				width: 100%;
				border: none;
				background: transparent;
				color: inherit;
				font: inherit;
				text-align: left;
				cursor: pointer;
			}
			.search-entity-primary {
				padding: 0.75rem;
			}
			.search-entity-primary.active,
			.search-head.active {
				background: var(--surface);
			}
			.search-type {
				display: inline-flex;
				margin-bottom: 0.35rem;
				padding: 0.12rem 0.42rem;
				border: 1px solid rgba(255, 93, 114, 0.28);
				border-radius: 999px;
				color: var(--danger-text);
				font-size: 0.68rem;
				font-weight: 750;
				letter-spacing: 0.03em;
				text-transform: uppercase;
			}
			.search-title {
				display: block;
				color: var(--text);
				font-size: 0.95rem;
				font-weight: 700;
			}
			.search-entity-primary.active .search-title,
			.search-head.active .search-title {
				color: var(--accent-text);
			}
			.search-package {
				display: block;
				overflow: hidden;
				margin-top: 0.2rem;
				padding: 0;
				border: 0;
				background: transparent;
				color: var(--accent-text);
				font-size: 0.78rem;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			.search-context,
			.search-crumb {
				display: block;
				margin-top: 0.3rem;
				color: var(--text-secondary);
				font-size: 0.75rem;
			}
			.search-entity-actions {
				display: flex;
				gap: 0.25rem;
				padding: 0.35rem;
				border-top: 1px solid var(--border);
				background: var(--surface-subtle);
			}
			.search-entity-action {
				padding: 0.35rem 0.55rem;
				border-radius: 0.45rem;
				color: var(--text-secondary);
				font-size: 0.75rem;
				font-weight: 650;
				text-decoration: none;
			}
			.search-entity-action:hover,
			.search-entity-action.active {
				background: rgba(255, 65, 90, 0.12);
				color: var(--text);
			}
			.search-head {
				padding: 0.55rem 0.75rem;
				border-radius: 0.7rem;
			}
			.search-head .search-crumb {
				margin-top: 0;
			}
			.search-lines {
				display: flex;
				flex-direction: column;
				min-width: 0;
				margin: 0.15rem 0 0 1.1rem;
				padding-left: 0.6rem;
				border-left: 2px solid var(--border);
			}
			.search-line {
				overflow: hidden;
				min-width: 0;
				padding: 0.35rem 0.6rem;
				border-radius: 0.6rem;
				color: var(--text-secondary);
				font-size: 0.85rem;
				line-height: 1.55;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			.search-line.code {
				font-family: 'SF Mono', SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
				font-size: 0.8rem;
			}
			.search-line.active {
				background: rgba(255, 65, 90, 0.12);
				color: var(--text);
			}
			.search-line mark,
			.search-head mark {
				background: transparent;
				color: var(--text);
				font-weight: 650;
				text-decoration: underline;
				text-underline-offset: 2px;
			}
			.search-empty {
				margin: 0;
				padding: 1.75rem 1rem;
				color: var(--text-secondary);
				font-size: 0.9rem;
				text-align: center;
			}
			.search-retry {
				margin-left: 0.45rem;
				padding: 0;
				border: 0;
				background: transparent;
				color: var(--accent-text);
				font: inherit;
				font-weight: 700;
				cursor: pointer;
			}
			@media (max-width: 520px) {
				.search-overlay {
					padding: 4.5rem 0.5rem 0.5rem;
				}
				.search-entity-actions {
					flex-wrap: wrap;
				}
			}
		</style>
	</div>
}

export function DocsSearch() @{
	const [open, setOpen] = useState(false);
	const triggerEl = useRef<HTMLButtonElement | null>(null);
	const returnFocusEl = useRef<HTMLElement | null>(null);

	const close = () => {
		setOpen(false);
		(returnFocusEl.current ?? triggerEl.current)?.focus();
		returnFocusEl.current = null;
	};

	const openSearch = (returnFocusTo: HTMLElement | null) => {
		returnFocusEl.current = returnFocusTo ?? triggerEl.current;
		setOpen(true);
	};

	useEffect(() => {
		const onOpen = (event: Event) => {
			const detail = (event as CustomEvent<DocsSearchOpenDetail>).detail;
			openSearch(detail?.returnFocusTo ?? null);
		};
		const onKey = (event: KeyboardEvent) => {
			const target = event.target;
			const typing =
				target instanceof HTMLElement &&
					(target.isContentEditable || target.contentEditable === 'true' ||
						target.closest('[contenteditable]:not([contenteditable="false"])') !== null ||
						/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
			if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				if (open) close();
				else openSearch(triggerEl.current);
			} else if (event.key === '/' && !typing) {
				event.preventDefault();
				openSearch(triggerEl.current);
			}
		};
		document.addEventListener(DOCS_SEARCH_OPEN_EVENT, onOpen);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener(DOCS_SEARCH_OPEN_EVENT, onOpen);
			document.removeEventListener('keydown', onKey);
		};
	});

	<>
		<button
			ref={triggerEl}
			type="button"
			class="search-trigger"
			aria-label="Search docs, packages, and integrations"
			onClick={() => openSearch(triggerEl.current)}
		>
			<span
				class="search-trigger-icon"
				style={'--icon:url("' + searchUrl + '")'}
				aria-hidden="true"
			></span>
			<span class="search-trigger-label">Search Octane</span>
			<kbd class="search-trigger-kbd">⌘/Ctrl K</kbd>
		</button>
		@if (open) {
			<SearchDialogPortal onClose={close} />
		}
		<style>
			.search-trigger {
				display: inline-flex;
				align-items: center;
				gap: 0.5rem;
				height: 36px;
				padding: 0 0.6rem;
				border: 1px solid var(--border);
				border-radius: 9999px;
				background: var(--surface-subtle);
				color: var(--text-secondary);
				font: inherit;
				font-size: 0.875rem;
				cursor: pointer;
				transition:
					background 0.15s,
					color 0.15s,
					border-color 0.15s;
			}
			.search-trigger:hover {
				border-color: var(--border);
				background: var(--surface);
				color: var(--text);
			}
			.search-trigger-icon {
				width: 16px;
				height: 16px;
				flex: none;
				background: currentColor;
				mask: var(--icon) center / contain no-repeat;
				-webkit-mask: var(--icon) center / contain no-repeat;
			}
			.search-trigger-kbd {
				padding: 0.1rem 0.35rem;
				border: 1px solid var(--border);
				border-radius: 0.35rem;
				font-family: inherit;
				font-size: 0.7rem;
				line-height: 1.4;
			}
			.search-trigger-label,
			.search-trigger-kbd {
				white-space: nowrap;
			}
			@media (max-width: 960px) {
				.search-trigger-kbd {
					display: none;
				}
			}
			@media (max-width: 720px) {
				.search-trigger {
					width: 36px;
					justify-content: center;
					padding: 0;
				}
				.search-trigger-label,
				.search-trigger-kbd {
					display: none;
				}
			}
		</style>
	</>
}

function SearchDialogPortal(props: DialogProps) {
	return createPortal(SearchDialog, document.body, { onClose: props.onClose });
}
