// Home: hero + side-by-side .tsrx sample, feature cards, and the "proven" stat
// strip. The code sample is an .mdx module so it rides the same Shiki pipeline
// as the docs.
import { Link } from '@octanejs/router';
import CodeSample from '../content/home-sample.mdx';

const FEATURES = [
	{
		title: 'Compiled templates',
		body: 'Components compile ahead of time to template clones and direct DOM ' +
			'writes — no virtual DOM, no diffing, most of React’s runtime work ' +
			'already done before the page loads.',
	},
	{
		title: 'Native events',
		body: 'Real, delegated DOM events instead of a synthetic layer. onClick is a ' +
			'click. currentTarget, capture, and propagation behave exactly like the ' +
			'platform.',
	},
	{
		title: 'Streaming SSR',
		body: 'renderToPipeableStream and renderToReadableStream flush each Suspense ' +
			'boundary as its data resolves — out-of-order, Fizz-style — plus full ' +
			'buffered SSR and byte-stable hydration.',
	},
	{
		title: 'Drop-in React model',
		body: 'The same hooks, memo, context, portals, Suspense, transitions, and ' +
			'actions API. Ports of zustand, TanStack Query & Router, Radix, Lexical ' +
			'and more work by changing the import.',
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
					The same hooks, Suspense and actions API you already know — compiled ahead of time. No
					virtual DOM. No rules of hooks.
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
				</article>
			}
		</section>

		<section class="proven">
			<div class="proven-stat">
				<span class="proven-number">2,200+</span>
				<span class="proven-label">
					{'conformance tests ported from facebook/react — '}
					<Link to="/docs/differences-from-react">see what diverges, on purpose</Link>
				</span>
			</div>
			<div class="proven-stat">
				<span class="proven-number">0</span>
				<span class="proven-label">
					rules of hooks — conditions, early returns and loops are fine
				</span>
			</div>
			<div class="proven-stat">
				<span class="proven-number">10</span>
				<span class="proven-label">
					packages: runtime + compiler, metaframework, and 8 ecosystem ports
				</span>
			</div>
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
				background: #2b3138;
				border: 1px solid rgba(255, 255, 255, 0.06);
				border-radius: 1rem;
				padding: 1.5rem;
			}
			.card-title {
				margin: 0 0 0.5rem;
				font-size: 1.05rem;
				letter-spacing: -0.01em;
			}
			.card-body {
				margin: 0;
				color: #99a1b3;
				font-size: 0.925rem;
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
		</style>
	</div>
}
