// The "why" section: the two questions that frame the evidence below — why adopt
// Octane today, and why it isn't signal-powered — closing on the trade the
// benchmarks back up. Sits between the proven stats and the interactive explorer,
// so the coda's "suites below" points straight at the measured comparison.
//
// Layout: a centered title over a two-column question/answer grid (the question
// labels the left rail, its prose fills the right), collapsing to a single stacked
// column on narrow screens. The coda closes it as a pull-quote. On wide screens a
// rail of ported-library marks (./library-icons.ts) fills the space to the right
// of the prose. Each mark links to its binding on GitHub; the rail disappears
// below the two-column breakpoint.
import { Link } from '@octanejs/tanstack-router';
import { ecosystemPackageGuideHref } from '../../../lib/ecosystem-presentation.ts';
import { LIBRARY_ICONS } from './library-icons.ts';

export function Why() @{
	<section class="why" aria-labelledby="why-heading">
		<h2 id="why-heading" class="why-title">
			{'Your app should feel fast. '}
			<span class="why-accent">Your code should still feel familiar.</span>
		</h2>

		<div class="why-body">
			<div class="why-main">
				<div class="why-grid">
					<div class="why-row">
						<h3 class="why-question">What does moving a React app to Octane look like?</h3>
						<div class="why-answers">
							<p class="why-answer">
								{'An Octane component is still a plain function with props, hooks and context. ' +
									'State lives where you expect it to, and data still flows from parent to ' +
									'child. If you know React, most of Octane will already make sense.'}
							</p>
							<p class="why-answer">
								{'Keep your existing TSX and convert components to TSRX as you go. The ' +
									'component model stays the same, so the migration does not require a ' +
									'redesign. The work is easy to review, whether you do it by hand or with a ' +
									'coding agent.'}
							</p>
						</div>
					</div>

					<div class="why-row">
						<h3 class="why-question">Why not build Octane on signals?</h3>
						<div class="why-answers">
							<p class="why-answer">
								{'Signals are useful, and you can use them in an Octane app when they fit. ' +
									'Octane does not make them the foundation because that would change how ' +
									'every component reads state. Components stay as plain functions that run ' +
									'from top to bottom. The compiler handles the bookkeeping.'}
							</p>
						</div>
					</div>
				</div>

				<blockquote class="why-coda">
					<strong>The benchmarks show the trade-off.</strong>
					{' Signal-based frameworks lead in workloads designed around signals. Across ' +
						'the suites below, Octane stays competitive without changing the way you ' +
						'structure components. '}
					<Link to="/docs/$slug" params={{ slug: 'tsrx-vs-tsx' }}>
						See what TSRX adds →
					</Link>
				</blockquote>
			</div>

			<div class="why-rail">
				<div class="why-rail-inner">
					<div class="why-rail-grid">
						@for (const lib of LIBRARY_ICONS; key lib.slug) {
							<a
								class="why-rail-tile"
								href={ecosystemPackageGuideHref(lib.packageName)}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={`View the ${lib.name} binding on GitHub`}
								title={lib.name}
							>
								<svg viewBox="0 0 24 24" fill="currentColor">
									<path d={lib.path} />
								</svg>
							</a>
						}
					</div>
					<p class="why-rail-caption">The libraries you already use, ported.</p>
				</div>
			</div>
		</div>

		<style>
			/* Shares the hairline top border the other lower sections use. */
			.why {
				border-top: 1px solid var(--border);
				padding: 4rem 0;
				margin-top: 2rem;
			}
			/* The title is left-aligned over the column below it. */
			.why-title {
				font-size: 2.4rem;
				line-height: 1.12;
				letter-spacing: -0.03em;
				margin: 0;
				font-weight: 800;
				max-width: 48rem;
				scroll-margin-top: 5.5rem;
			}
			.why-accent {
				display: block;
				color: var(--accent);
			}
			/* A single left-aligned column: the question sits over its prose, with a
			   top rule per row (after the first) keeping the pairs visually separate. */
			.why-grid {
				max-width: 48rem;
				margin: 2.75rem 0 0;
				display: grid;
				gap: 2.25rem;
			}
			.why-row {
				display: grid;
				gap: 0.6rem;
			}
			.why-row + .why-row {
				padding-top: 2.25rem;
				border-top: 1px solid var(--border);
			}
			.why-question {
				margin: 0;
				color: var(--text);
				font-size: 1.2rem;
				line-height: 1.3;
				letter-spacing: -0.015em;
			}
			.why-answer {
				margin: 0;
				color: var(--text-secondary);
				font-size: 1.02rem;
				line-height: 1.6;
			}
			.why-answer + .why-answer {
				margin-top: 0.85rem;
			}
			/* The ported-library rail only exists on wide screens, where the 48rem
			   prose column leaves an empty gutter inside the 1420px page frame. It is
			   purely decorative — hidden from AT, and from viewports too narrow to fit
			   both columns (48rem prose + 3rem gap + 16.25rem cluster + page padding). */
			.why-rail {
				display: none;
			}
			@media (min-width: 1160px) {
				.why-body {
					display: grid;
					grid-template-columns: minmax(0, 48rem) minmax(0, 1fr);
					gap: 3rem;
					align-items: center;
				}
				.why-rail {
					display: flex;
					justify-content: center;
				}
			}
			.why-rail-inner {
				display: grid;
				gap: 1.5rem;
				justify-items: center;
			}
			.why-rail-grid {
				display: grid;
				grid-template-columns: repeat(3, 4.75rem);
				gap: 1rem;
				/* Reserves room for the staggered middle column's downward nudge. */
				padding-bottom: 1.5rem;
			}
			.why-rail-tile {
				display: grid;
				place-items: center;
				aspect-ratio: 1;
				border: 1px solid var(--border);
				border-radius: 1rem;
				/* Same faint accent wash the Proven stat cards use. */
				background: linear-gradient(160deg, rgba(255, 65, 90, 0.05), transparent 55%), var(--panel);
				color: var(--text-secondary);
				text-decoration: none;
				transition:
					color 0.15s ease,
					border-color 0.15s ease;
			}
			/* Brick-stagger the middle column so the cluster reads as a composed
			   arrangement rather than a table. */
			.why-rail-tile:nth-child(3n + 2) {
				transform: translateY(1.5rem);
			}
			.why-rail-tile:hover {
				color: var(--text);
				border-color: var(--border-strong);
			}
			.why-rail-tile:focus-visible {
				outline: 2px solid var(--accent);
				outline-offset: 3px;
			}
			.why-rail-tile svg {
				width: 1.9rem;
				height: 1.9rem;
			}
			.why-rail-caption {
				margin: 0;
				color: var(--text-secondary);
				font-size: 0.85rem;
				letter-spacing: 0.01em;
			}
			/* The coda is a pull-quote: an accent rail on the left, a faint accent
			   wash, and roomier type set it apart from the answers above. */
			.why-coda {
				max-width: 48rem;
				margin: 3rem 0 0;
				padding: 1.25rem 1.75rem;
				border-left: 3px solid var(--accent);
				border-radius: 0 0.75rem 0.75rem 0;
				background: linear-gradient(90deg, rgba(255, 65, 90, 0.07), transparent 55%);
				color: var(--text-secondary);
				font-size: 1.1rem;
				line-height: 1.6;
			}
			.why-coda strong {
				color: var(--text);
			}
			.why-coda :global(a) {
				display: inline-block;
				white-space: nowrap;
				color: var(--accent-text);
				text-decoration: underline;
				text-underline-offset: 0.16em;
			}
			@media (max-width: 560px) {
				.why {
					padding: 3rem 0;
				}
				.why-title {
					font-size: 2rem;
				}
				.why-coda {
					font-size: 1.02rem;
					padding: 1rem 1.25rem;
				}
			}
		</style>
	</section>
}
