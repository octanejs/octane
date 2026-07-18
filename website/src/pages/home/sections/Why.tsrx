// The "why" section: the two questions that frame the evidence below — why adopt
// Octane today, and why it isn't signal-powered — closing on the trade the
// benchmarks back up. Sits between the proven stats and the interactive explorer,
// so the coda's "suites below" points straight at the measured comparison.
//
// Layout: a centered title over a two-column question/answer grid (the question
// labels the left rail, its prose fills the right), collapsing to a single stacked
// column on narrow screens. The coda closes it as a pull-quote. On wide screens a
// decorative rail of ported-library marks (./library-icons.ts) fills the space to
// the right of the prose; it duplicates the ecosystem list in Proven, so it stays
// aria-hidden and disappears below the two-column breakpoint.
import { Link } from '@tanstack/octane-router';
import { LIBRARY_ICONS } from './library-icons.ts';

export function Why() @{
	<section class="why" aria-labelledby="why-heading">
		<h2 id="why-heading" class="why-title">
			{'Fast should be how your app feels. '}
			<span class="why-accent">Not a new way you have to think.</span>
		</h2>

		<div class="why-body">
			<div class="why-main">
				<div class="why-grid">
					<div class="why-row">
						<h3 class="why-question">Why should someone adopt Octane today?</h3>
						<div class="why-answers">
							<p class="why-answer">
								{'Because adoption should build on what you already know. Octane keeps the ' +
									'component-and-hooks mental model familiar, so developers carry over their ' +
									'hard-won intuition.'}
							</p>
							<p class="why-answer">
								{'For the large proportion of React codebases centered on function components ' +
									'and hooks, that continuity also makes migration especially straightforward for ' +
									'AI agents: they can preserve the app’s component boundaries and reasoning instead ' +
									'of redesigning it around a new reactive model. Begin with standard TSX, then opt ' +
									'into TSRX one component at a time; fewer rules and dependency lists let related ' +
									'code stay together. Octane changes the machinery beneath your app without asking ' +
									'everyone who works on it to start over.'}
							</p>
						</div>
					</div>

					<div class="why-row">
						<h3 class="why-question">Why isn't Octane's rendering powered by signals?</h3>
						<div class="why-answers">
							<p class="why-answer">
								{'Signals are good. They make updates wonderfully precise, and you can still use ' +
									'them in an Octane app when that model fits the problem. But powering the framework ' +
									'with signals would make them more than an optional tool; they would become part of ' +
									'how every application represents and reads state. Octane makes a different trade: ' +
									'components stay as familiar functions you can read from top to bottom, while the ' +
									'compiler and runtime carry the complexity instead of spreading it through the ' +
									'application.'}
							</p>
						</div>
					</div>
				</div>

				<blockquote class="why-coda">
					<strong>The trade holds up.</strong>
					{' Signals still win the workloads built for them, but across the checked-in ' +
						'suites below, Octane’s tightly tuned compiler and runtime largely keep pace — ' +
						'without asking you to rewire how you think. '}
					<Link to="/docs/tsrx-vs-tsx">See what TSRX adds →</Link>
				</blockquote>
			</div>

			<div class="why-rail" aria-hidden="true">
				<div class="why-rail-inner">
					<div class="why-rail-grid">
						@for (const lib of LIBRARY_ICONS; key lib.slug) {
							<div class="why-rail-tile" title={lib.name}>
								<svg viewBox="0 0 24 24" fill="currentColor">
									<path d={lib.path} />
								</svg>
							</div>
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
				border-color: rgba(255, 255, 255, 0.22);
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
