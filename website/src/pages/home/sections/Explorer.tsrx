// Interactive benchmark explorer — the linked bar chart + heatmap over the same
// checked-in ×-vs-Octane matrix the teaser above summarizes (HOME_SUMMARY).
// Staged on the home page for now; it's generic over a BenchCard, so /benchmarks
// can feed it the full grid next.
import { Link } from '@octanejs/tanstack-router';
import { BenchmarkExplorer } from '../../../components/BenchmarkExplorer.tsrx';
import { HOME_SUMMARY } from '../../../content/home-benchmark.ts';

export function Explorer() @{
	<section class="explorer" aria-labelledby="explorer-heading">
		<div class="explorer-head">
			<div class="explorer-titlerow">
				<h2 id="explorer-heading" class="explorer-title">Measured, not vibes</h2>
				<Link to="/benchmarks" class="explorer-all">All suites →</Link>
			</div>
			<p class="explorer-sub">
				Pick the frameworks and suite for the bar chart, or scan the whole grid — every cell is a
				geometric mean of that suite’s per-operation scores relative to Octane. Lower is better.
			</p>
		</div>
		<BenchmarkExplorer card={HOME_SUMMARY} />

		<style>
			.explorer {
				border-top: 1px solid var(--border);
				padding: 2.5rem 0 3rem;
				margin-top: 2rem;
			}
			.explorer-head {
				margin-bottom: 1.5rem;
			}
			.explorer-titlerow {
				display: flex;
				align-items: baseline;
				justify-content: space-between;
				gap: 1rem;
				flex-wrap: wrap;
			}
			.explorer-title {
				margin: 0 0 0.5rem;
				font-size: 1.75rem;
				letter-spacing: -0.02em;
			}
			.explorer-titlerow :global(a.explorer-all) {
				color: var(--accent-text);
				font-weight: 600;
				font-size: 0.9rem;
				white-space: nowrap;
			}
			.explorer-sub {
				margin: 0;
				max-width: 46rem;
				color: var(--text-secondary);
				font-size: 0.925rem;
				line-height: 1.55;
			}
		</style>
	</section>
}
