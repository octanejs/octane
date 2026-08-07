// The native section: the same claim the React-interop section above makes
// about frameworks, made about platforms. Both phones are Octane components
// compiled for Lynx and running live, which is the whole argument — a
// screenshot of a native app proves nothing about the programming model.
//
// It takes the copy-beside-stage shape its neighbours use (ReactCompat's code
// panel, Spin's canvas), so the three read as one rhythm rather than three
// layouts.
//
// The phones live behind <Hydrate when={visible()}> (LynxShowcase), so the
// server streams the section's copy and nothing Lynx-related downloads until a
// reader scrolls near it.
import { Hydrate } from 'octane';
import { visible } from 'octane/hydration';
import { Link } from '@octanejs/tanstack-router';
import { LynxShowcase } from './LynxShowcase.tsrx';

export function Lynx() @{
	<section class="lynx" aria-labelledby="lynx-heading">
		<div class="lynx-body">
			<div class="lynx-copy">
				<h2 id="lynx-heading" class="lynx-title">
					{'Build Native Apps, '}
					<span class="lynx-accent">with Lynx and Octane</span>
				</h2>
				<p class="lynx-lead">
					{'Use Octane to build apps that render with native views on iOS and Android ' +
						'through Lynx. These demos are running live in the browser with Lynx for Web, ' +
						'not shown as screenshots.'}
				</p>
				<p class="lynx-note">
					{'Hooks, context, Suspense and transitions work the same way. Mark only ' +
						'frame-critical code to run on the main thread. Octane support for Lynx' +
						' is currently in early access.'}
				</p>
				<Link to="/docs/$slug" params={{ slug: 'lynx' }} class="lynx-link">
					Learn how Octane works with Lynx →
				</Link>
			</div>

			<div class="lynx-stage">
				<Hydrate when={visible()}>
					<LynxShowcase />
				</Hydrate>
			</div>
		</div>

		<style>
			/* Shares the hairline top border the other lower sections use. */
			.lynx {
				border-top: 1px solid var(--border);
				padding: 4rem 0;
				margin-top: 2rem;
			}
			/* When stacked, keep the same 48rem measure as the prose sections above
			   so the column's edges line up with them. The wide-screen two-column
			   grid drops this cap. */
			.lynx-body {
				max-width: 48rem;
			}
			.lynx-title {
				font-size: 2.4rem;
				line-height: 1.12;
				letter-spacing: -0.03em;
				margin: 0;
				font-weight: 800;
				scroll-margin-top: 5.5rem;
			}
			.lynx-accent {
				display: block;
				color: var(--accent);
			}
			.lynx-lead {
				margin: 1.5rem 0 0;
				color: var(--text-secondary);
				font-size: 1.02rem;
				line-height: 1.6;
			}
			.lynx-note {
				margin: 1rem 0 0;
				color: var(--text-secondary);
				font-size: 0.95rem;
				line-height: 1.6;
			}
			.lynx-copy :global(a.lynx-link) {
				display: inline-block;
				margin-top: 1.5rem;
				color: var(--accent-text);
				text-decoration: underline;
				text-underline-offset: 0.16em;
				white-space: nowrap;
			}
			.lynx-stage {
				margin-top: 3rem;
			}
			@media (min-width: 1000px) {
				.lynx-body {
					max-width: none;
					display: grid;
					grid-template-columns: minmax(0, 30rem) minmax(0, 1fr);
					gap: 3.5rem;
					align-items: center;
				}
				.lynx-stage {
					margin-top: 0;
				}
			}
			@media (max-width: 560px) {
				.lynx {
					padding: 3rem 0;
				}
				.lynx-title {
					font-size: 2rem;
				}
			}
		</style>
	</section>
}
