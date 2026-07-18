// Benchmark teaser: @octanejs/recharts over the checked-in scores
// (content/benchmarks.ts) — the full set lives at /benchmarks.
import { Link } from '@tanstack/octane-router';
import { BenchBars } from '../../../components/BenchBars.tsrx';
import { HOME_SUMMARY } from '../../../content/benchmarks.ts';

export function Bench() @{
	<section class="bench" aria-labelledby="bench-heading">
		<div class="bench-head">
			<h2 id="bench-heading" class="bench-title">Measured, not vibes</h2>
			<Link to="/benchmarks" class="bench-all">All suites →</Link>
		</div>
		<div class="bench-grid">
			<BenchBars card={HOME_SUMMARY} showValues={true} width={1100} />
		</div>
		<p class="bench-note">
			{'Ratios are geometric means over each suite’s per-operation checked-in benchmark scores ('}
			<code>benchmarks/baselines/local</code>
			{'), Octane .tsrx vs React 19.2, Solid 2.0 beta, Ripple 0.3 and Vue Vapor 3.6. Reproduce with '}
			<code>pnpm bench:all -- --quick --ratios</code>
			{', or see '}
			<Link to="/benchmarks">absolute per-operation numbers for the charted suites</Link>
			{' — including the de-opt suites octane runs against itself.'}
		</p>

		<style>
			.bench {
				border-top: 1px solid var(--border);
				padding: 2.5rem 0 3rem;
				margin-top: 2rem;
			}
			.bench-head {
				display: flex;
				align-items: baseline;
				justify-content: space-between;
				gap: 1rem;
				flex-wrap: wrap;
				padding-bottom: 1.5rem;
			}
			.bench-title {
				margin: 0;
				font-size: 1.75rem;
				letter-spacing: -0.02em;
			}
			.bench-head :global(a.bench-all) {
				color: var(--accent-text);
				font-weight: 600;
				font-size: 0.9rem;
			}
			.bench-grid {
				display: grid;
				grid-template-columns: 1fr;
				gap: 1.25rem;
			}
			.bench-note {
				color: var(--text-secondary);
				font-size: 0.85rem;
				margin: 1.5rem 0 0;
			}
			.bench-note code {
				background: var(--code-bg);
				border: 1px solid rgba(255, 255, 255, 0.08);
				border-radius: 0.35rem;
				padding: 0.1rem 0.4rem;
				font-size: 0.85em;
			}
		</style>
	</section>
}
