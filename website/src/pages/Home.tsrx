// Home: hero + side-by-side .tsrx sample, feature cards, and the "proven" stat
// strip. The code sample is an .mdx module so it rides the same Shiki pipeline
// as the docs. The bench teaser is deterministic @octanejs/visx SVG over the
// checked-in benchmark scores (content/benchmarks.ts) — the full set lives at
// /benchmarks.
import { Link } from '@octanejs/tanstack-router';
import CodeSample from '../content/home-sample.mdx';
import { HomeBenchBars } from '../components/HomeBenchBars.tsrx';
import { HOME_SUMMARY } from '../content/home-benchmark.ts';

const FEATURES = [
	{
		title: 'No rules of hooks',
		body: 'No dependency arrays and no rules of hooks. The compiler tracks what ' +
			'your effects, memos and callbacks actually use, and hooks can sit behind ' +
			'conditions or early returns.',
	},
	{
		title: 'Improved async',
		body: 'Independent use() calls start together instead of suspending one at a ' +
			'time down the tree. Nested fetches warm up early, and streaming SSR sends ' +
			'each boundary as soon as it’s ready.',
	},
	{
		title: 'No virtual DOM',
		body: 'Templates compile to cloned nodes and direct DOM writes, and keyed ' +
			'@for lists move the fewest nodes possible. Plain .tsx still works, so you ' +
			'can adopt .tsrx one component at a time.',
	},
	{
		title: 'Familiar model',
		body: 'Hooks, memo, context, portals, transitions, actions, controlled forms ' +
			'and Suspense all behave the way you expect. Events are native, refs are ' +
			'just props, and first-party bindings cover the libraries you already use.',
	},
];

export function Home() @{
	<div class="home">
		<section class="hero">
			<div class="hero-copy">
				<h1 class="hero-title">
					{'React’s programming model, '}
					<span class="hero-accent">compiled</span>
					{'.'}
				</h1>
				<p class="hero-sub">
					{'The successor to '}
					<a
						href="https://github.com/infernojs/inferno"
						target="_blank"
						rel="noreferrer"
					>{'Inferno'}</a>
					{', carrying its performance-first goal forward: React’s hooks, Suspense ' +
						'and actions, compiled ahead of time. No virtual DOM. No rules of hooks. ' +
						'No hand-maintained dependency arrays. Octane\'s compiler does all the heavy lifting for you.'}
				</p>
				<div class="hero-actions">
					<Link to="/docs/quick-start" class="btn-primary">Get started</Link>
					<Link to="/docs/differences-from-react" class="btn-ghost">Differences from React</Link>
				</div>
			</div>
			<div class="hero-code">
				<div class="hero-code-bar">
					<span class="dot dot-r"></span>
					<span class="dot dot-y"></span>
					<span class="dot dot-g"></span>
					<span class="hero-code-name">Counter.tsrx</span>
				</div>
				<CodeSample />
			</div>
		</section>

		<section class="features">
			@for (const feature of FEATURES; key feature.title) {
				<article class="card">
					<h2 class="card-title">
						{feature.title as string}
					</h2>
					<p class="card-body">
						{feature.body as string}
					</p>
					@if (feature.href) {
						<a class="card-link" href={feature.href} target="_blank" rel="noreferrer">
							{(feature.linkLabel ?? feature.href) + ' →'}
						</a>
					}
				</article>
			}
		</section>

		<section class="proven">
			<div class="proven-stat">
				<span class="proven-number">7,000+</span>
				<span class="proven-label">
					{'test executions across the runtime, compiler, SSR and bindings, including ' +
						'compiler-mode reruns; the core suite has 2,200+ distinct cases. '}
					<a
						href="https://github.com/octanejs/octane/blob/main/docs/react-parity-coverage.md"
						target="_blank"
						rel="noreferrer"
					>React-derived coverage is tracked case by case</a>
				</span>
			</div>
			<div class="proven-stat">
				<span class="proven-number">0</span>
				<span class="proven-label">
					rules of hooks
				</span>
			</div>
			<div class="proven-stat">
				<span class="proven-number">25</span>
				<span class="proven-label">
					{'framework bindings — Zustand, TanStack Query & Router, Radix, Lucide, '}
					<Link to="/docs/bindings">Recharts and more</Link>
				</span>
			</div>
		</section>

		<section class="why" aria-labelledby="why-heading">
			<div class="why-copy">
				<h2 id="why-heading" class="why-title">
					{'Fast should be how your app feels. '}
					<span class="why-accent">Not a new way you have to think.</span>
				</h2>
				<h3 class="why-question">Why should someone adopt Octane today?</h3>
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
				<h3 class="why-question">Why isn't Octane's rendering powered by signals?</h3>
				<p class="why-answer">
					{'Signals are good. They make updates wonderfully precise, and you can still use ' +
						'them in an Octane app when that model fits the problem. But powering the framework ' +
						'with signals would make them more than an optional tool; they would become part of ' +
						'how every application represents and reads state. Octane makes a different trade: ' +
						'components stay as familiar functions you can read from top to bottom, while the ' +
						'compiler and runtime carry the complexity instead of spreading it through the ' +
						'application.'}
				</p>
				<p class="why-coda">
					<strong>The trade holds up.</strong>
					{' Signals still win the workloads built for them, but across the checked-in ' +
						'suites below, Octane’s tightly tuned compiler and runtime largely keep pace — ' +
						'without asking you to rewire how you think. '}
					<Link to="/docs/tsrx-vs-tsx">See what TSRX adds →</Link>
				</p>
			</div>
		</section>

		<section class="bench" aria-labelledby="bench-heading">
			<div class="bench-head">
				<h2 id="bench-heading" class="bench-title">Measured, not vibes</h2>
				<Link to="/benchmarks" class="bench-all">All suites →</Link>
			</div>
			<div class="bench-grid">
				<HomeBenchBars card={HOME_SUMMARY} />
			</div>
			<p class="bench-note">
				{'Ratios are geometric means over each suite’s per-operation checked-in benchmark scores ('}
				<code>benchmarks/baselines/local</code>
				{'), Octane .tsrx vs React 19.2, Solid 2.0 beta, Ripple 0.3 and Vue Vapor 3.6 beta. Reproduce with '}
				<code>pnpm bench:all -- --quick --ratios</code>
				{', or see '}
				<Link to="/benchmarks">absolute per-operation numbers for the charted suites</Link>
				{' — including the de-opt suites octane runs against itself.'}
			</p>
		</section>

		<style>
			.home {
				max-width: 1200px;
				margin: 0 auto;
				padding: 0 1.5rem;
			}
			.hero {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 3rem;
				align-items: center;
				padding: 5rem 0 4rem;
			}
			@media (max-width: 900px) {
				.hero {
					grid-template-columns: 1fr;
					padding-top: 3rem;
				}
			}
			.hero-title {
				font-size: 3.25rem;
				line-height: 1.1;
				letter-spacing: -0.03em;
				margin: 0 0 1.25rem;
				font-weight: 800;
			}
			.hero-accent {
				color: #ff415a;
			}
			.hero-sub {
				color: #99a1b3;
				font-size: 1.25rem;
				margin: 0 0 2rem;
				max-width: 34rem;
			}
			.hero-actions {
				display: flex;
				gap: 0.75rem;
				flex-wrap: wrap;
			}
			.hero-actions :global(a.btn-primary) {
				background: #ff415a;
				color: #16181d;
				font-weight: 600;
				padding: 0.7rem 1.4rem;
				border-radius: 9999px;
				transition: background 0.15s;
			}
			.hero-actions :global(a.btn-primary:hover) {
				background: #ff5d72;
				text-decoration: none;
			}
			.hero-actions :global(a.btn-ghost) {
				color: #f4eee8;
				font-weight: 600;
				padding: 0.7rem 1.4rem;
				border-radius: 9999px;
				border: 1px solid rgba(255, 255, 255, 0.15);
				transition: background 0.15s;
			}
			.hero-actions :global(a.btn-ghost:hover) {
				background: rgba(255, 255, 255, 0.06);
				text-decoration: none;
			}
			.hero-sub a {
				color: #f4eee8;
				font-weight: 600;
			}
			.hero-sub a:hover {
				color: #ff5d72;
			}
			.hero-lineage {
				color: #99a1b3;
				font-size: 0.875rem;
				margin: 1.5rem 0 0;
				max-width: 34rem;
			}
			.hero-code {
				background: #16181d;
				border: 1px solid rgba(255, 255, 255, 0.1);
				border-radius: 1rem;
				overflow: hidden;
				box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
			}
			.hero-code-bar {
				display: flex;
				align-items: center;
				gap: 0.4rem;
				padding: 0.6rem 1rem;
				border-bottom: 1px solid rgba(255, 255, 255, 0.08);
			}
			.dot {
				width: 10px;
				height: 10px;
				border-radius: 50%;
				display: inline-block;
			}
			.dot-r {
				background: #f47067;
			}
			.dot-y {
				background: #dfab25;
			}
			.dot-g {
				background: #57ab5a;
			}
			.hero-code-name {
				margin-left: 0.5rem;
				color: #99a1b3;
				font-size: 0.8rem;
				font-family: ui-monospace, Menlo, Consolas, monospace;
			}
			.hero-code :global(pre.shiki) {
				border: none;
				border-radius: 0;
				margin: 0;
			}
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
			.card {
				position: relative;
				display: flex;
				flex-direction: column;
				min-height: 17rem;
				background: linear-gradient(145deg, rgba(255, 65, 90, 0.055), transparent 42%), #2b3138;
				border: 1px solid rgba(255, 255, 255, 0.08);
				border-radius: 1rem;
				padding: 1.5rem;
				overflow: hidden;
			}
			.card-title {
				margin: 0 0 0.75rem;
				font-size: 1.2rem;
				letter-spacing: -0.01em;
			}
			.card-body {
				margin: 0;
				color: #99a1b3;
				font-size: 0.925rem;
			}
			.card-link {
				display: inline-block;
				align-self: flex-start;
				margin-top: auto;
				padding-top: 1.25rem;
				color: #ff5d72;
				font-weight: 600;
				font-size: 0.9rem;
			}
			.card-link:hover {
				color: #ff8296;
				text-decoration: none;
			}
			.proven {
				display: grid;
				grid-template-columns: repeat(3, 1fr);
				gap: 1.25rem;
				border-top: 1px solid rgba(255, 255, 255, 0.1);
				padding: 2.5rem 0 1rem;
				margin-top: 1rem;
			}
			@media (max-width: 900px) {
				.proven {
					grid-template-columns: 1fr;
				}
			}
			.proven-stat {
				display: flex;
				flex-direction: column;
				gap: 0.25rem;
			}
			.proven-number {
				font-size: 2.25rem;
				font-weight: 800;
				letter-spacing: -0.02em;
				color: #ff415a;
			}
			.proven-label {
				color: #99a1b3;
				font-size: 0.925rem;
				max-width: 24rem;
			}
			.proven-label :global(a),
			.why-coda :global(a),
			.bench-note :global(a) {
				text-decoration: underline;
				text-underline-offset: 0.16em;
			}
			.why-coda :global(a) {
				display: inline-block;
				white-space: nowrap;
			}
			.why {
				border-top: 1px solid rgba(255, 255, 255, 0.1);
				padding: 4rem 0;
				margin-top: 2rem;
			}
			.why-copy {
				max-width: 50rem;
			}
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
				color: #ff415a;
			}
			.why-question {
				color: #f4eee8;
				font-size: 1.2rem;
				letter-spacing: -0.015em;
				margin: 2rem 0 0;
			}
			.why-answer {
				color: #c4c9d4;
				font-size: 1.05rem;
				margin: 0.65rem 0 0;
				max-width: 48rem;
			}
			.why-answer + .why-answer {
				margin-top: 0.85rem;
			}
			.why-coda {
				color: #99a1b3;
				font-size: 0.875rem;
				margin: 1.75rem 0 0;
				padding-left: 1rem;
				border-left: 2px solid rgba(255, 65, 90, 0.65);
				max-width: 48rem;
			}
			.why-coda strong {
				color: #f4eee8;
			}
			@media (max-width: 560px) {
				.why {
					padding: 3rem 0;
				}
				.why-title {
					font-size: 2rem;
				}
			}
			.bench {
				border-top: 1px solid rgba(255, 255, 255, 0.1);
				padding: 2.5rem 0 3rem;
				margin-top: 0;
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
				color: #ff5d72;
				font-weight: 600;
				font-size: 0.9rem;
			}
			.bench-sub {
				color: #99a1b3;
				margin: 0.5rem 0 1.75rem;
				max-width: 40rem;
			}
			.bench-grid {
				display: grid;
				grid-template-columns: 1fr;
				gap: 1.25rem;
			}
			.bench-note {
				color: #99a1b3;
				font-size: 0.85rem;
				margin: 1.5rem 0 0;
			}
			.bench-note code {
				background: #16181d;
				border: 1px solid rgba(255, 255, 255, 0.08);
				border-radius: 0.35rem;
				padding: 0.1rem 0.4rem;
				font-size: 0.85em;
			}
		</style>
	</div>
}
