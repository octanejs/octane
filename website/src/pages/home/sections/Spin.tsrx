// The 3D flame section: the logo's flame mark as live extruded geometry you
// can throw around, sitting between the "why" prose and the benchmark
// explorer. It earns its place by being two demos at once — @octanejs/three
// (an R3F-compatible renderer) drives the scene, and the section itself ships
// behind <Hydrate when={visible()}>, so the server streams a static shell and
// three.js only downloads when the reader scrolls near. The stage column is
// aria-hidden: it is a pointer toy, and everything it says is said in the copy.
import { Hydrate } from 'octane';
import { visible } from 'octane/hydration';
import { Link } from '@octanejs/tanstack-router';
import { SpinStage } from './SpinStage.tsrx';

export function Spin() @{
	<section class="spin" aria-labelledby="spin-heading">
		<div class="spin-body">
			<div class="spin-copy">
				<h2 id="spin-heading" class="spin-title">
					{'Three.js, '}
					<span class="spin-accent">on Octane.</span>
				</h2>
				<p
					class="spin-lead"
				>{'Octane supports Three.js through @octanejs/three – a technical-preview port of React Three Fiber.'}</p>
				<Link to="/docs/$slug" params={{ slug: 'bindings' }} class="spin-link">
					Browse all the bindings →
				</Link>
			</div>
			<div class="spin-stage-cell" aria-hidden="true">
				<Hydrate when={visible()}>
					<SpinStage />
				</Hydrate>
			</div>
		</div>

		<style>
			/* Shares the hairline top border the other lower sections use. */
			.spin {
				border-top: 1px solid var(--border);
				padding: 4rem 0;
				margin-top: 2rem;
			}
			.spin-title {
				font-size: 2.4rem;
				line-height: 1.12;
				letter-spacing: -0.03em;
				margin: 0;
				font-weight: 800;
				scroll-margin-top: 5.5rem;
			}
			.spin-accent {
				display: block;
				color: var(--accent);
			}
			.spin-lead {
				margin: 1.5rem 0 0;
				color: var(--text-secondary);
				font-size: 1.02rem;
				line-height: 1.6;
			}
			.spin-link {
				display: inline-block;
				margin-top: 1.5rem;
				color: var(--accent-text);
				text-decoration: underline;
				text-underline-offset: 0.16em;
				white-space: nowrap;
			}
			/* A borderless accent wash keeps the transparent canvas part of the
			   page background. Sizing lives here because the Hydrate boundary's
			   wrapper div sits between the cell and SpinStage's own markup. */
			.spin-stage-cell {
				margin-top: 2.5rem;
				background: radial-gradient(60% 80% at 50% 45%, rgba(255, 65, 90, 0.08), transparent 70%);
				height: clamp(18rem, 55vw, 24rem);
			}
			.spin-stage-cell > :global(div) {
				width: 100%;
				height: 100%;
			}
			@media (min-width: 1000px) {
				.spin-body {
					display: grid;
					grid-template-columns: minmax(0, 30rem) minmax(0, 1fr);
					gap: 3.5rem;
					align-items: center;
				}
				.spin-stage-cell {
					margin-top: 0;
					height: 26rem;
				}
			}
			@media (max-width: 560px) {
				.spin {
					padding: 3rem 0;
				}
				.spin-title {
					font-size: 2rem;
				}
			}
		</style>
	</section>
}
