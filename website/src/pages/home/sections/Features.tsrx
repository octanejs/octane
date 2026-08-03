// The four feature cards — a title over a plain-text blurb.
import { BINDING_COUNT } from '../../../content/bindings.ts';

const FEATURES = [
	{
		title: 'No rules of hooks',
		body: 'Forget dependency arrays and rigid hook rules. The compiler tracks what your effects, memos, and callbacks use automatically, so hooks can safely live inside conditions or after early returns.',
	},
	{
		title: 'Parallel async',
		body: 'Independent use() calls start at the same time instead of suspending one by one. Nested fetches begin earlier, and streaming SSR sends each boundary as soon as it’s ready.',
	},
	{
		title: 'No virtual DOM',
		body: 'Templates compile to cloned DOM nodes with direct updates. The keyed lists move only the nodes they need to. You can still use .tsx components and move to .tsrx one component at a time.',
	},
	{
		title: 'Still feels familiar',
		body: 'You still get hooks, memo, context, portals, transitions, actions, controlled forms and ' +
			'Suspense. Events use the DOM, refs are regular props, and ' +
			BINDING_COUNT +
			' first-party bindings cover familiar libraries.',
	},
];

export function Features() @{
	<section class="features">
		@for (const feature of FEATURES; key feature.title) {
			<article class="card">
				<header class="card-head">
					<h2 class="card-title">{feature.title as string}</h2>
				</header>
				<div class="card-content">
					<p class="card-body">{feature.body as string}</p>
				</div>
			</article>
		}

		<style>
			.features {
				display: grid;
				grid-template-columns: repeat(4, 1fr);
				gap: 1.25rem;
				padding: 1rem 0 3rem;
			}
			@media (max-width: 1000px) {
				.features {
					grid-template-columns: repeat(2, 1fr);
				}
			}
			@media (max-width: 560px) {
				.features {
					grid-template-columns: 1fr;
				}
			}
			/* The title sits over the body with a small gap — no divider. The card owns
			   one uniform padding; the head and content render as plain blocks. */
			.card {
				position: relative;
				display: flex;
				flex-direction: column;
				gap: 0.5rem;
				background:
					linear-gradient(145deg, rgba(255, 65, 90, 0.055), transparent 42%), var(--panel);
				border: 1px solid var(--border);
				border-radius: 1rem;
				padding: 0.9rem;
				overflow: hidden;
			}
			.card-title {
				margin: 0;
				font-size: 1.1rem;
				letter-spacing: -0.01em;
			}
			.card-body {
				margin: 0;
				color: var(--text-secondary);
				font-size: 0.925rem;
			}
		</style>
	</section>
}
