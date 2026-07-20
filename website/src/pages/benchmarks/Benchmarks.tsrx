// /benchmarks — the checked-in runtime, SSR, async, and size baselines, charted
// as deterministic plain-div bar cards (the same bar view the explorer uses).
// Three sections: the normalized at-a-glance explorer (the same linked bar/heatmap
// component the home page stages, fed the matrix recomputed from FRAMEWORK_CARDS so
// it can never drift from the cards below), then the cross-framework comparisons,
// then the octane-internal de-opt ("authoring cliff") suites. All numbers are the
// checked-in benchmark scores; the page cannot drift from the repo because the
// JSON is imported at build time.
import { BenchBars } from '../../components/BenchBars.tsrx';
import { BenchmarkExplorer } from '../../components/BenchmarkExplorer.tsrx';
import { OnThisPage } from '../../components/OnThisPage.tsrx';
import { FRAMEWORK_CARDS, OCTANE_CARDS } from '../../content/benchmarks.ts';
import { createHomeSummary } from '../../content/home-benchmark.ts';
import { useAnimatedMobileNavigation } from '../../hooks/use-animated-mobile-navigation.ts';
import { useTitle } from '../../hooks/use-title.ts';

const OVERVIEW = createHomeSummary(FRAMEWORK_CARDS);

// The scroll-spy sidebar's targets: one level-2 row per section heading below,
// with a nested level-3 row for every benchmark card, derived from the same
// card arrays the sections chart so the rail can never drift from the page.
// Level-2 ids match the `<h2 id>`s; card ids match the anchored card wrappers
// (both carry the scroll-margin-top clearing the sticky header). A sidebar click
// moves focus onto its target, so the card wrappers — unlike the self-naming
// h2s — need role="group" with the card title as their accessible name, or
// screen-reader users land in the section without hearing which chart it is.
const cardAnchor = (card: { id: string }) => 'bench-' + card.id;
export const BENCH_SECTIONS: readonly { id: string; title: string; level?: 2 | 3 }[] = [
	{ id: 'bench-overview', title: 'Every suite at a glance' },
	{ id: 'bench-frameworks', title: 'Octane vs the field' },
	...FRAMEWORK_CARDS.map(
		(card) => ({ id: cardAnchor(card), title: card.title, level: 3 as const }),
	),
	{ id: 'bench-internal', title: 'The authoring cliff' },
	...OCTANE_CARDS.map((card) => ({ id: cardAnchor(card), title: card.title, level: 3 as const })),
];

export function Benchmarks() @{
	useTitle('Octane — Benchmarks');
	const { mobileMenuOpen, mobileMenuPanel, toggleMobileNavigation, closeMobileNavigation } =
		useAnimatedMobileNavigation();

	<div class="benchpage">
		<div class="benchpage-frame">
			<aside class="benchpage-sidebar">
				<button
					type="button"
					class="benchpage-sidebar-toggle"
					aria-expanded={mobileMenuOpen}
					aria-controls="benchmark-sidebar-nav"
					onClick={toggleMobileNavigation}
				>
					<span>Benchmarks</span>
					<span class="benchpage-sidebar-icon" aria-hidden="true">+</span>
				</button>
				<div class={['benchpage-sidebar-panel', mobileMenuOpen && 'is-open']} ref={mobileMenuPanel}>
					<div class="benchpage-sidebar-panel-inner">
						<div id="benchmark-sidebar-nav">
							<a class="benchpage-sidebar-link" href="/benchmarks" aria-current="page">
								Benchmarks
							</a>
							<OnThisPage
								sections={BENCH_SECTIONS}
								resetKey="benchmarks"
								onNavigate={closeMobileNavigation}
							/>
						</div>
					</div>
				</div>
			</aside>
			<div class="benchpage-main">
				<header class="benchpage-head">
					<h1 class="benchpage-title">Benchmarks</h1>
					<p class="benchpage-sub">
						{'Benchmark score in milliseconds per operation — lower is better. Every chart is the ' +
							'checked-in baseline from the repo’s own suites: same apps, same hardware, ' +
							'same run. Reproduce them with '}
						<code>pnpm bench:all</code>
						{', and see '}
						<a
							href="https://github.com/octanejs/octane/tree/main/benchmarks"
							target="_blank"
							rel="noreferrer"
						>{'benchmarks/'}</a>
						{' for what each suite measures.'}
					</p>
				</header>

				<section class="benchpage-section" aria-labelledby="bench-overview">
					<h2 id="bench-overview" class="benchpage-h2">Every suite at a glance</h2>
					<p class="benchpage-note">
						Start here: each cell is the geometric mean of that suite’s per-operation scores
						relative to Octane — 1× is Octane, below 1× is faster than Octane. Pick frameworks and a
						suite for the bar view, or scan the whole grid and re-baseline it to each suite’s
						fastest framework. The sections below have the full per-operation charts in
						milliseconds.
					</p>
					<BenchmarkExplorer card={OVERVIEW} />
				</section>

				<section class="benchpage-section" aria-labelledby="bench-frameworks">
					<h2 id="bench-frameworks" class="benchpage-h2">Octane vs the field</h2>
					<p class="benchpage-note">
						Octane compiled from .tsrx and .tsx, against React 19 (with a separate React Compiler
						comparison where available), Preact 10, Solid, Svelte 5, Ripple and Vue Vapor — each
						framework’s fixture written the way its docs recommend. The ranked chips on each card
						are that suite’s one-line reading: every framework’s geometric mean across the card’s
						operations, relative to Octane, fastest first.
					</p>
					<div class="benchpage-grid">
						@for (const card of FRAMEWORK_CARDS; key card.id) {
							<div
								class="benchpage-anchor"
								id={cardAnchor(card)}
								role="group"
								aria-label={card.title}
							>
								<BenchBars card={card} />
							</div>
						}
					</div>
				</section>

				<section class="benchpage-section" aria-labelledby="bench-internal">
					<h2 id="bench-internal" class="benchpage-h2">The authoring cliff</h2>
					<p class="benchpage-note">
						Octane against itself: what naively-authored code costs relative to the compiled fast
						path. The de-opt fixtures render the same apps through plain createElement — the shape
						every binding produces — so the cliff is a first-class, regression-guarded number.
					</p>
					<div class="benchpage-grid">
						@for (const card of OCTANE_CARDS; key card.id) {
							<div
								class="benchpage-anchor"
								id={cardAnchor(card)}
								role="group"
								aria-label={card.title}
							>
								<BenchBars card={card} />
							</div>
						}
					</div>
				</section>
			</div>
		</div>

		<style>
			.benchpage {
				max-width: 1420px;
				margin: 0 auto;
				padding: 0 1.5rem;
			}
			.benchpage-head {
				max-width: 44rem;
				margin-bottom: 2.5rem;
			}
			.benchpage-title {
				font-size: 2.5rem;
				font-weight: 800;
				letter-spacing: -0.02em;
				margin: 0 0 0.75rem;
			}
			.benchpage-sub {
				color: var(--text-secondary);
				font-size: 1.05rem;
				line-height: 1.6;
				margin: 0;
			}
			.benchpage-sub code {
				background: var(--code-bg);
				border-radius: 6px;
				padding: 0.1rem 0.4rem;
				font-size: 0.9em;
			}
			/* The benchmark scroll-spy is the page's primary left sidebar, matching
			   the documentation layout instead of occupying a separate right rail. */
			.benchpage-frame {
				display: grid;
				grid-template-columns: 220px minmax(0, 1fr);
				gap: clamp(2rem, 4vw, 4rem);
				align-items: start;
			}
			.benchpage-sidebar {
				position: sticky;
				top: 76px;
				padding-top: 2rem;
				max-height: calc(100vh - 92px);
				overflow-y: auto;
				scrollbar-width: thin;
			}
			.benchpage-sidebar-toggle {
				display: none;
			}
			.benchpage-sidebar-link {
				display: block;
				padding: 0.45rem 0.75rem;
				border-radius: 0.75rem;
				background: rgba(255, 65, 90, 0.14);
				color: var(--accent-text);
				font-size: 0.925rem;
				font-weight: 500;
			}
			.benchpage-sidebar-link:hover {
				color: var(--accent-text);
				text-decoration: none;
			}
			.benchpage-main {
				min-width: 0;
				padding-top: 3rem;
			}
			@media (max-width: 800px) {
				.benchpage-frame {
					grid-template-columns: minmax(0, 1fr);
					gap: 1rem;
				}
				.benchpage-sidebar {
					position: static;
					max-height: none;
					margin: 0 -1.5rem;
					padding: 0.75rem 1.5rem;
					overflow: hidden;
					border-bottom: 1px solid var(--border);
				}
				.benchpage-sidebar-toggle {
					display: flex;
					align-items: center;
					justify-content: space-between;
					width: 100%;
					min-height: 2.5rem;
					padding: 0;
					border: 0;
					background: transparent;
					color: var(--text);
					font-size: 0.9rem;
					font-weight: 750;
					cursor: pointer;
				}
				.benchpage-sidebar-icon {
					color: var(--accent-text);
					font-size: 1.15rem;
					transition: transform 0.2s ease;
				}
				.benchpage-sidebar-toggle[aria-expanded='true'] .benchpage-sidebar-icon {
					transform: rotate(45deg);
				}
				.benchpage-sidebar-panel {
					display: grid;
					grid-template-rows: 0fr;
					opacity: 0;
					visibility: hidden;
					transition:
						grid-template-rows 0.22s cubic-bezier(0.22, 0.61, 0.36, 1),
						opacity 0.18s ease,
						visibility 0s 0.22s;
				}
				.benchpage-sidebar-panel.is-open {
					grid-template-rows: 1fr;
					opacity: 1;
					visibility: visible;
					transition-delay: 0s;
				}
				.benchpage-sidebar-panel-inner {
					min-height: 0;
					overflow: hidden;
				}
				.benchpage-sidebar-link {
					display: none;
				}
				.benchpage-sidebar-panel :global(.on-this-page) {
					margin-top: 0.65rem;
					padding-top: 0.75rem;
					border-top: 1px solid var(--border);
				}
				.benchpage-main {
					padding-top: 1.5rem;
				}
			}
			@media (prefers-reduced-motion: reduce) {
				.benchpage-sidebar-icon,
				.benchpage-sidebar-panel {
					transition: none;
				}
			}
			.benchpage-section {
				margin-bottom: 3rem;
			}
			.benchpage-h2 {
				font-size: 1.5rem;
				font-weight: 700;
				letter-spacing: -0.01em;
				margin: 0 0 0.5rem;
				/* Anchored scrolls land the heading clear of the sticky header, just
				   under the scroll-spy's activation line. */
				scroll-margin-top: 5.5rem;
			}
			.benchpage-note {
				color: var(--text-secondary);
				max-width: 44rem;
				line-height: 1.55;
				margin: 0 0 1.5rem;
			}
			.benchpage-grid {
				display: grid;
				grid-template-columns: 1fr;
				gap: 1.25rem;
				align-items: start;
			}
			.benchpage-anchor {
				min-width: 0;
				/* Card anchors land clear of the sticky header, like the h2s. */
				scroll-margin-top: 5.5rem;
			}
		</style>
	</div>
}
