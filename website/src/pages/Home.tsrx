// Home: hero + side-by-side .tsrx sample, feature cards, and the "proven" stat
// strip. The code sample is an .mdx module so it rides the same Shiki pipeline
// as the docs. The bench teaser charts are @octanejs/recharts over the
// checked-in benchmark scores (content/benchmarks.ts) — the full set lives at
// /benchmarks.
import { Link } from '@octanejs/tanstack-router';
import CodeSample from '../content/home-sample.mdx';
import { BenchBars } from '../components/BenchBars.tsrx';
import { HOME_SUMMARY } from '../content/benchmarks.ts';

const FEATURES = [
	{
		eyebrow: 'Compiler-owned reactivity',
		title: 'Hooks without the homework',
		body: 'No dependency arrays and no rules of hooks. The compiler tracks what ' +
			'your effects, memos and callbacks actually use, and hooks can sit behind ' +
			'conditions or early returns. You keep the hooks you know — the ' +
			'bookkeeping is gone.',
	},
	{
		eyebrow: 'Async by default',
		title: 'Suspense without waterfalls',
		body: 'Independent use() calls start together instead of suspending one at a ' +
			'time down the tree. Nested fetches warm up early, and streaming SSR sends ' +
			'each boundary as soon as it’s ready — not when the slowest one is.',
	},
	{
		eyebrow: 'Compiled rendering',
		title: 'No virtual DOM.',
		body: 'Templates compile to cloned nodes and direct DOM writes, and keyed ' +
			'@for lists move the fewest nodes possible. Plain .tsx still works, so you ' +
			'can adopt .tsrx one component at a time.',
		href: 'https://tsrx.dev',
		linkLabel: 'tsrx.dev',
	},
	{
		eyebrow: 'React knowledge, upgraded',
		title: 'Change the import. Keep the model.',
		body: 'Hooks, memo, context, portals, transitions, actions, controlled forms ' +
			'and Suspense all behave the way you expect. Events are native, refs are ' +
			'just props, and 17 first-party bindings cover the libraries you already use.',
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
						'No hand-maintained dependency arrays — the compiler tracks closure ' +
						'captures for you.'}
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
					<h3 class="card-title">
						{feature.title as string}
					</h3>
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
				<span class="proven-number">6,000+</span>
				<span class="proven-label">
					{'tests across the runtime, compiler, SSR and bindings — including 2,200+ ' +
						'React conformance cases; '}
					<Link to="/docs/differences-from-react">see what diverges, on purpose</Link>
				</span>
			</div>
			<div class="proven-stat">
				<span class="proven-number">0</span>
				<span class="proven-label">
					rules of hooks — conditions and early returns are fine
				</span>
			</div>
			<div class="proven-stat">
				<span class="proven-number">17</span>
				<span class="proven-label">
					{'ecosystem ports — Zustand, TanStack Query & Router, Radix, Base UI, '}
					<Link to="/docs/bindings">Recharts and more</Link>
				</span>
			</div>
		</section>

		<section class="bench" aria-labelledby="bench-heading">
			<div class="bench-head">
				<h2 id="bench-heading" class="bench-title">Measured, not vibes</h2>
				<Link to="/benchmarks" class="bench-all">All suites →</Link>
			</div>
			<div class="bench-grid">
				<BenchBars card={HOME_SUMMARY} width={1100} />
			</div>
			<p class="bench-note">
				{'Ratios are geometric means over each suite’s per-operation checked-in benchmark scores ('}
				<code>benchmarks/baselines/local</code>
				{'), Octane .tsrx vs React 19.2, Preact 10, Solid 2.0 beta, Svelte 5, Ripple 0.3 and Vue Vapor 3.6 beta. Reproduce with '}
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
			.hero-kicker {
				color: #ff657a;
				font-size: 0.75rem;
				font-weight: 800;
				letter-spacing: 0.14em;
				text-transform: uppercase;
				margin: 0 0 0.85rem;
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
				color: #f4eee8;
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
				min-height: 20rem;
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
			.bench {
				border-top: 1px solid rgba(255, 255, 255, 0.1);
				padding: 2.5rem 0 3rem;
				margin-top: 2rem;
			}
			.bench-head {
				display: flex;
				align-items: baseline;
				justify-content: space-between;
				gap: 1rem;
				flex-wrap: wrap;
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
