// The four feature cards. Copy is authored as runs, not one string: `t` is plain
// prose, `k` is a key phrase, and `c` is an API token. The point is that a reader
// skimming only the marked runs still gets the pitch.
const t = (text: string) => ({ kind: 'text' as const, text });
const k = (text: string) => ({ kind: 'key' as const, text });
const c = (text: string) => ({ kind: 'code' as const, text });

const FEATURES = [
	{
		title: 'No rules of hooks',
		body: [
			t('No '),
			k('dependency arrays'),
			t(' and no '),
			k('rules of hooks'),
			t(
				'. The compiler tracks what your effects, memos and callbacks actually use, and hooks can sit behind ',
			),
			k('conditions or early returns'),
			t('.'),
		],
	},
	{
		title: 'Improved async',
		body: [
			t('Independent '),
			c('use()'),
			t(' calls start '),
			k('together'),
			t(' instead of suspending one at a time down the tree. Nested fetches '),
			k('warm up early'),
			t(', and streaming SSR sends each boundary '),
			k('as soon as it’s ready'),
			t('.'),
		],
	},
	{
		title: 'No virtual DOM',
		body: [
			t('Templates compile to cloned nodes and '),
			k('direct DOM writes'),
			t(', and keyed '),
			c('@for'),
			t(' lists move the '),
			k('fewest nodes possible'),
			t('. Plain '),
			c('.tsx'),
			t(' still works, so you can adopt '),
			c('.tsrx'),
			t(' one component at a time.'),
		],
	},
	{
		title: 'Familiar model',
		body: [
			t('Hooks, memo, context, portals, transitions, actions, controlled forms and Suspense all '),
			k('behave the way you expect'),
			t('. Events are '),
			k('native'),
			t(', refs are just props, and '),
			k('18 first-party bindings'),
			t(' cover the libraries you already use.'),
		],
	},
	// The runs carry their own key — `@for` needs one, and text can repeat.
].map(
	(feature) => ({
		...feature,
		// Precompute each run's mark class up front so the template body is a single
		// <span> with a dynamic class — NO nested control flow. A `@for > @switch`
		// block mis-hydrates here: SSR emits the switch's control-flow markers, but the
		// client adopt cursor expects the case element directly, so hydration rebuilds
		// the subtree (Octane hydration mismatch at the @default <span>). One element
		// per run, keyed, is the plain keyed-list path that adopts cleanly.
		body: feature.body.map(
			(run, i) => ({
				...run,
				i,
				cls: run.kind === 'key'
					? 'mark-key'
					: run.kind === 'code'
						? 'mark-code'
						: '',
			}),
		),
	}),
);

export function Features() @{
	<section class="features">
		@for (const feature of FEATURES; key feature.title) {
			<article class="card">
				<header class="card-head">
					<h3 class="card-title">
						{feature.title as string}
					</h3>
				</header>
				<div class="card-content">
					<p class="card-body">
						@for (const run of feature.body; key run.text + run.i) {
							<span class={run.cls}>
								{run.text as string}
							</span>
						}
					</p>
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
			/* Two regions — a titled head over the body — and the card itself carries
			   NO padding, so the rule between them runs edge to edge as a real
			   divider. Each region owns its own uniform padding instead, and no
			   min-height: the grid already stretches the row to its tallest card. */
			.card {
				position: relative;
				display: flex;
				flex-direction: column;
				background:
					linear-gradient(145deg, rgba(255, 65, 90, 0.055), transparent 42%), var(--panel);
				border: 1px solid rgba(255, 255, 255, 0.08);
				border-radius: 1rem;
				padding: 0;
				overflow: hidden;
			}
			.card-head {
				padding: 0.7rem;
				border-bottom: 1px solid var(--border);
			}
			.card-title {
				margin: 0;
				font-size: 1.1rem;
				letter-spacing: -0.01em;
			}
			.card-content {
				flex: 1;
				display: flex;
				flex-direction: column;
				padding: 0.7rem;
			}
			.card-body {
				margin: 0;
				color: var(--text-secondary);
				font-size: 0.925rem;
			}
			/* The body copy is muted; a key phrase simply comes up to full-strength
			   text, and an API token is monospace in the accent. No boxes, no
			   underlines — the contrast does the work. */
			.mark-key {
				color: var(--text);
				font-weight: 600;
			}
			.mark-code {
				color: var(--accent-text);
				font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
				font-size: 0.875em;
				white-space: nowrap;
			}
		</style>
	</section>
}
