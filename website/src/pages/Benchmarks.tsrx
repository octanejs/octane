// /benchmarks — every suite from benchmarks/baselines/local/, charted with
// @octanejs/recharts (the site dogfoods its own charting binding). Two
// sections: cross-framework comparisons, then the octane-internal de-opt
// ("authoring cliff") suites. All numbers are the checked-in medians; the
// page cannot drift from the repo because the JSON is imported at build time.
import { BenchBars } from '../components/BenchBars.tsrx';
import { FRAMEWORK_CARDS, OCTANE_CARDS } from '../content/benchmarks.ts';

export function Benchmarks() @{
	<div class="benchpage">
		<header class="benchpage-head">
			<h1 class="benchpage-title">Benchmarks</h1>
			<p class="benchpage-sub">
				{'Median milliseconds per operation — lower is better. Every chart is the ' +
					'checked-in baseline from the repo’s own suites: same apps, same hardware, ' +
					'same run. Reproduce them with '}
				<code>pnpm bench</code>
				{', and see '}
				<a
					href="https://github.com/octanejs/octane/tree/main/benchmarks"
					target="_blank"
					rel="noreferrer"
				>{'benchmarks/'}</a>
				{' for what each suite measures.'}
			</p>
		</header>

		<section class="benchpage-section" aria-labelledby="bench-frameworks">
			<h2 id="bench-frameworks" class="benchpage-h2">Octane vs the field</h2>
			<p class="benchpage-note">
				Octane compiled from .tsrx and .tsx, against React 19, Solid, Ripple and Vue Vapor — each
				framework’s fixture written the way its docs recommend.
			</p>
			<div class="benchpage-grid">
				@for (const card of FRAMEWORK_CARDS; key card.id) {
					<BenchBars card={card} />
				}
			</div>
		</section>

		<section class="benchpage-section" aria-labelledby="bench-internal">
			<h2 id="bench-internal" class="benchpage-h2">The authoring cliff</h2>
			<p class="benchpage-note">
				Octane against itself: what naively-authored code costs relative to the compiled fast path.
				The de-opt fixtures render the same apps through plain createElement — the shape every
				binding produces — so the cliff is a first-class, regression-guarded number.
			</p>
			<div class="benchpage-grid">
				@for (const card of OCTANE_CARDS; key card.id) {
					<BenchBars card={card} />
				}
			</div>
		</section>

		<style>
			.benchpage {
				max-width: 1200px;
				margin: 0 auto;
				padding: 3rem 1.5rem 0;
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
				color: #99a1b3;
				font-size: 1.05rem;
				line-height: 1.6;
				margin: 0;
			}
			.benchpage-sub code {
				background: #16181d;
				border-radius: 6px;
				padding: 0.1rem 0.4rem;
				font-size: 0.9em;
			}
			.benchpage-section {
				margin-bottom: 3rem;
			}
			.benchpage-h2 {
				font-size: 1.5rem;
				font-weight: 700;
				letter-spacing: -0.01em;
				margin: 0 0 0.5rem;
			}
			.benchpage-note {
				color: #99a1b3;
				max-width: 44rem;
				line-height: 1.55;
				margin: 0 0 1.5rem;
			}
			.benchpage-grid {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
				gap: 1.25rem;
				align-items: start;
			}
			@media (max-width: 560px) {
				.benchpage-grid {
					grid-template-columns: 1fr;
				}
			}
		</style>
	</div>
}
