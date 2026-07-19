// Header docs search: a compact trigger in the nav, and a ⌘K / Ctrl-K dialog
// that ranks the .mdx sections (src/lib/docs-search.ts) and deep links into
// /docs/<slug>#<section>.
//
// Results are a board rather than a list: one card per matching section
// (breadcrumb + heading), with the individual matching lines beneath it. Both
// the heading and every line are selectable rows — the whole card navigates to
// the same anchor, so a line is just a more specific reason to go there.
//
// The dialog is portalled to <body> on purpose: the sticky header sets
// `backdrop-filter`, which makes it a containing block for fixed descendants —
// a `position: fixed` overlay rendered inside it would be clipped to the 60px
// nav strip instead of covering the viewport.
import { createPortal, useEffect, useRef, useState } from 'octane';
import { useNavigate } from '@tanstack/octane-router';
import { loadSearchIndex, searchDocs } from '../lib/docs-search.ts';
import type { SearchGroup, SearchRecord } from '../lib/docs-search.ts';
import searchUrl from '../assets/search.svg';

interface DialogProps {
	onClose: () => void;
}

function SearchDialog(props: DialogProps) @{
	const [query, setQuery] = useState('');
	const [groups, setGroups] = useState<SearchGroup[]>([]);
	const [active, setActive] = useState(0);
	const [ready, setReady] = useState(false);
	const index = useRef<readonly SearchRecord[]>([]);
	const inputEl = useRef<HTMLInputElement | null>(null);
	const navigate = useNavigate();

	// The index is a dynamic import — load it as the dialog opens, and re-rank
	// whatever the user typed while it was in flight.
	useEffect(() => {
		let live = true;
		loadSearchIndex().then((records) => {
			if (!live) return;
			index.current = records;
			setReady(true);
			setGroups(searchDocs(records, inputEl.current?.value ?? ''));
		});
		inputEl.current?.focus();
		return () => {
			live = false;
		};
	});

	// The page behind the dialog must not scroll while it is open.
	useEffect(() => {
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

	// Flatten the board into keyboard rows: each card's heading is a row, and so
	// is every line under it. `targets[i]` is the section row `i` navigates to.
	// (`@for` iterates arrays, so every row carries its own index and key.)
	const targets: SearchGroup[] = [];
	const board = groups.map((group) => {
		const headRow = targets.push(group) - 1;
		const lines = group.lines.map(
			(line) => ({
				...line,
				row: targets.push(group) - 1,
			}),
		);
		return {
			key: group.key,
			crumb: 'Docs › ' + group.docTitle,
			title: group.id ? group.title : group.docTitle,
			headRow,
			lines,
			group,
		};
	});

	const go = (group: SearchGroup) => {
		props.onClose();
		navigate({
			to: '/docs/$slug',
			params: { slug: group.slug },
			hash: group.id || undefined,
		});
		// The router restores scroll position rather than honouring the hash on a
		// client navigation, so land on the section ourselves once it is painted.
		// DocPage and its MDX are lazy-loaded, so the target can take many frames to
		// mount — poll for it (bounded) instead of assuming a single frame is enough.
		if (group.id) {
			const id = group.id;
			let frames = 0;
			const scrollToSection = () => {
				const el = document.getElementById(id);
				if (el) {
					el.scrollIntoView({ block: 'start' });
				} else if (frames++ < 120) {
					requestAnimationFrame(scrollToSection);
				}
			};
			requestAnimationFrame(scrollToSection);
		}
	};

	// Keep the highlighted row inside the scrolled results panel.
	const reveal = (row: number) => {
		requestAnimationFrame(() => {
			document.querySelector('[data-search-row="' + row + '"]')?.scrollIntoView({
				block: 'nearest',
			});
		});
	};

	const step = (delta: number) => {
		const count = targets.length;
		if (count === 0) return;
		setActive((i) => {
			const next = (i + delta + count) % count;
			reveal(next);
			return next;
		});
	};

	const onQuery = (event: Event) => {
		const value = (event.currentTarget as HTMLInputElement).value;
		setQuery(value);
		setGroups(searchDocs(index.current, value));
		setActive(0);
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
		} else if (event.key === 'Enter' && targets[active]) {
			event.preventDefault();
			go(targets[active]);
		}
	};

	<div class="search-overlay" onClick={props.onClose} onKeyDown={onKeyDown}>
		{/* The panel swallows clicks so only the backdrop closes the dialog. */}
		<div
			class="search-panel"
			role="dialog"
			aria-modal="true"
			aria-label="Search the documentation"
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
					placeholder="Search the docs"
					aria-label="Search the documentation"
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
						<div class="search-card">
							<button
								type="button"
								class={['search-head', card.headRow === active && 'active']}
								role="option"
								aria-selected={card.headRow === active}
								data-search-row={card.headRow}
								onMouseEnter={() => setActive(card.headRow)}
								onClick={() => go(card.group)}
							>
								<span class="search-crumb">{card.crumb}</span>
								<span class="search-title">{card.title}</span>
							</button>
							@if (card.lines.length > 0) {
								<div class="search-lines">
									@for (const line of card.lines; key line.key) {
										<button
											type="button"
											class={['search-line', line.code && 'code', line.row === active && 'active']}
											role="option"
											aria-selected={line.row === active}
											data-search-row={line.row}
											onMouseEnter={() => setActive(line.row)}
											onClick={() => go(card.group)}
										>
											@for (const part of line.parts; key part.i) {
												@if (part.hit) {
													<mark>
														{part.text as string}
													</mark>
												} @else {
													<span>
														{part.text as string}
													</span>
												}
											}
										</button>
									}
								</div>
							}
						</div>
					}
				</div>
			} @else {
				<p class="search-empty">
					@if (!ready) {
						<span>Loading the index…</span>
					} @else {
						@if (query.trim().length < 2) {
							<span>Type to search the documentation.</span>
						} @else {
							<span>
								{'No matches for “' + query.trim() + '”.'}
							</span>
						}
					}
				</p>
			}
		</div>

		<style>
			.search-overlay {
				position: fixed;
				inset: 0;
				z-index: 50;
				display: flex;
				justify-content: center;
				/* flex-start, not the default stretch — the panel hugs its results
				   instead of filling the viewport when there is nothing to show. */
				align-items: flex-start;
				padding: 10vh 1rem 1rem;
				background: rgba(12, 14, 18, 0.72);
				backdrop-filter: blur(3px);
			}
			.search-panel {
				width: min(680px, 100%);
				max-height: 74vh;
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
				padding: 0.5rem;
				overflow-y: auto;
				/* Lines are clipped to one line each, so nothing legitimately needs
				   horizontal room — never scroll the board sideways. */
				overflow-x: hidden;
				display: flex;
				flex-direction: column;
				gap: 0.5rem;
				/* No scrollbar chrome on the board: the wheel and ↑/↓ (which reveal the
				   active row) are the way through the results. */
				scrollbar-width: none;
			}
			.search-board::-webkit-scrollbar {
				display: none;
			}
			.search-card {
				display: flex;
				flex-direction: column;
				min-width: 0;
			}
			/* The rail is this wrapper's left border — it ties the matched lines back
			   to the heading they sit under. */
			.search-lines {
				display: flex;
				flex-direction: column;
				min-width: 0;
				margin: 0.15rem 0 0 1.1rem;
				padding-left: 0.6rem;
				border-left: 2px solid var(--border);
			}
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
			.search-head {
				padding: 0.55rem 0.75rem;
				border-radius: 0.7rem;
			}
			.search-head.active {
				background: rgba(255, 255, 255, 0.07);
			}
			.search-crumb {
				display: block;
				color: var(--text-secondary);
				font-size: 0.75rem;
			}
			.search-title {
				display: block;
				color: var(--text);
				font-weight: 700;
				font-size: 0.95rem;
			}
			.search-head.active .search-title {
				color: var(--accent-text);
			}
			.search-line {
				min-width: 0;
				padding: 0.35rem 0.6rem;
				border-radius: 0.6rem;
				color: var(--text-secondary);
				font-size: 0.85rem;
				line-height: 1.55;
				overflow: hidden;
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
		</style>
	</div>
}

export function DocsSearch() @{
	const [open, setOpen] = useState(false);

	// ⌘K / Ctrl-K from anywhere, and `/` when the user is not already typing.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			// contentEditable surfaces (e.g. the CodeMirror editor on /playground) are
			// typing targets too — otherwise `/` there opens the palette instead of
			// inserting the character.
			const target = event.target;
			const typing =
				target instanceof HTMLElement &&
					(target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
			if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((o) => !o);
			} else if (event.key === '/' && !typing) {
				event.preventDefault();
				setOpen(true);
			}
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	});

	<>
		<button
			type="button"
			class="search-trigger"
			aria-label="Search documentation"
			onClick={() => setOpen(true)}
		>
			<span
				class="search-trigger-icon"
				style={'--icon:url("' + searchUrl + '")'}
				aria-hidden="true"
			></span>
			<span class="search-trigger-label">Search docs</span>
			<kbd class="search-trigger-kbd">⌘/Ctrl K</kbd>
		</button>
		@if (open) {
			<SearchDialogPortal onClose={() => setOpen(false)} />
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
				background: rgba(255, 255, 255, 0.04);
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
				color: var(--text);
				background: rgba(255, 255, 255, 0.08);
				border-color: rgba(255, 255, 255, 0.2);
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
			/* Keep the fixed-height header compact before the icon-only breakpoint. */
			@media (max-width: 960px) {
				.search-trigger-kbd {
					display: none;
				}
			}
			/* Below the nav breakpoint the trigger collapses to its icon. */
			@media (max-width: 720px) {
				.search-trigger {
					width: 36px;
					padding: 0;
					justify-content: center;
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
