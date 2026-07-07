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
		title: 'First-class TSRX',
		body: 'Author components in TSRX — the successor to JSX. ' +
			'Template control flow (@if, @for, @try), scoped styles, and hooks ' +
			'co-located in one file, compiled to Octane’s fastest output. Plain ' +
			'.tsx works too — mix them freely.',
		href: 'https://tsrx.dev',
		linkLabel: 'tsrx.dev',
	},
	{
		title: 'Drop-in React model',
		body: 'The same hooks, memo, context, portals, Suspense, transitions, and ' +
			'actions API. Ports of zustand, TanStack Query & Router, Radix, Lexical ' +
			'and more work by changing the import.',
	},
];

// Benchmark data: median ms per operation from the repo's own suites
// (benchmarks/results/*.json — `pnpm bench`), Octane .tsrx vs React 19.2, same
// app implementations. Update these when the checked-in results move.
interface BenchRow {
	op: string;
	octane: number;
	react: number;
}

const BENCH_JS_FRAMEWORK: BenchRow[] = [
	{ op: 'create 1,000 rows', octane: 1.6, react: 17.5 },
	{ op: 'replace all rows', octane: 3.4, react: 19.2 },
	{ op: 'partial update', octane: 0.2, react: 20.0 },
	{ op: 'select row', octane: 0.1, react: 11.5 },
	{ op: 'swap rows', octane: 0.3, react: 15.1 },
	{ op: 'clear rows', octane: 18.8, react: 45.0 },
];

const BENCH_DBMON: BenchRow[] = [
	{ op: 'mount', octane: 3.6, react: 48.2 },
	{ op: 'tick (all rows)', octane: 1.7, react: 12.0 },
	{ op: 'partial tick', octane: 0.8, react: 10.4 },
	{ op: 'sort', octane: 2.0, react: 13.7 },
	{ op: 'remount', octane: 4.6, react: 17.8 },
];

// Series colors — validated categorical pair for the site's dark surface
// (lightness band, chroma, CVD separation, contrast): Octane = brand accent,
// React = blue. Text/labels always use text tokens, never the series colors.
const OCTANE_COLOR = '#ff415a';
const REACT_COLOR = '#3d8bfd';

// Horizontal bar with a 4px-rounded DATA end and a square baseline end.
function barPath(y: number, w: number, h: number): string {
	if (w <= 6) {
		return 'M0,' + y + ' h' + Math.max(w, 2) + ' v' + h + ' h-' + Math.max(w, 2) + ' Z';
	}
	const r = 4;
	return (
		'M0,' + y + ' h' + (w - r) +
		' a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
		' v' + (h - 2 * r) +
		' a' + r + ',' + r + ' 0 0 1 -' + r + ',' + r +
		' h-' + (w - r) + ' Z'
	);
}

// A paired-bar chart (Octane vs React, median ms, lower is better). Every bar
// carries its value at the tip, so no gridlines/ticks are needed; native
// <title> tooltips back the hover.
function BenchChart(props: { title: string; rows: BenchRow[] }) @{
	const VIEW_W = 460;
	const PLOT_W = 380;
	const LABEL_H = 18;
	const BAR_H = 13;
	const PAIR_GAP = 2;
	const GROUP_GAP = 18;
	const groupH = LABEL_H + BAR_H * 2 + PAIR_GAP;
	const max = Math.max(...props.rows.map((r) => Math.max(r.octane, r.react)));
	const rows = props.rows.map((r, i) => {
		const top = i * (groupH + GROUP_GAP);
		return {
			op: r.op,
			labelY: top + 12,
			octaneY: top + LABEL_H,
			octaneW: Math.max((r.octane / max) * PLOT_W, 2),
			octaneLabel: r.octane.toFixed(1),
			reactY: top + LABEL_H + BAR_H + PAIR_GAP,
			reactW: Math.max((r.react / max) * PLOT_W, 2),
			reactLabel: r.react.toFixed(1),
		};
	});
	const height = rows.length * (groupH + GROUP_GAP) - GROUP_GAP + 4;

	<figure class="bench-card">
		<figcaption class="bench-card-title">{props.title as string}</figcaption>
		<svg
			viewBox={'0 0 ' + VIEW_W + ' ' + height}
			role="img"
			aria-label={props.title + ' — median milliseconds per operation, Octane vs React 19, lower is better'}
		>
			@for (const row of rows; key row.op) {
				<g>
					<text x="0" y={row.labelY} class="bench-op">
						{row.op as string}
					</text>
					<path d={barPath(row.octaneY, row.octaneW, BAR_H)} fill={OCTANE_COLOR}>
						<title>{'Octane — ' + row.op + ': ' + row.octaneLabel + ' ms'}</title>
					</path>
					<text x={row.octaneW + 8} y={row.octaneY + BAR_H - 3} class="bench-val">
						{row.octaneLabel as string}
					</text>
					<path d={barPath(row.reactY, row.reactW, BAR_H)} fill={REACT_COLOR}>
						<title>{'React — ' + row.op + ': ' + row.reactLabel + ' ms'}</title>
					</path>
					<text x={row.reactW + 8} y={row.reactY + BAR_H - 3} class="bench-val">
						{row.reactLabel as string}
					</text>
				</g>
			}
		</svg>
	</figure>
}

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
					{', carrying its performance-first goal forward: the hooks, Suspense and ' +
						'actions API you already know, compiled ahead of time. No virtual DOM. ' +
						'No rules of hooks.'}
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

		<section class="bench" aria-labelledby="bench-heading">
			<div class="bench-head">
				<h2 id="bench-heading" class="bench-title">Measured, not vibes</h2>
				<div class="bench-legend" aria-hidden="true">
					<span class="bench-key">
						<span class="bench-swatch bench-swatch-octane"></span>
						Octane
					</span>
					<span class="bench-key">
						<span class="bench-swatch bench-swatch-react"></span>
						React 19
					</span>
				</div>
			</div>
			<p class="bench-sub">
				Median milliseconds per operation — lower is better. Same apps, same
				hardware, from the repo’s own benchmark suites.
			</p>
			<div class="bench-grid">
				<BenchChart title="js-framework (1,000 rows)" rows={BENCH_JS_FRAMEWORK} />
				<BenchChart title="dbmon (databases dashboard)" rows={BENCH_DBMON} />
			</div>
			<p class="bench-note">
				{'Numbers are the checked-in medians from '}
				<code>benchmarks/</code>
				{' (Octane .tsrx vs React 19.2). Reproduce them with '}
				<code>pnpm bench</code>
				{'.'}
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
			.card-link {
				display: inline-block;
				margin-top: 0.75rem;
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
			.bench-legend {
				display: flex;
				gap: 1.25rem;
			}
			.bench-key {
				display: inline-flex;
				align-items: center;
				gap: 0.45rem;
				color: #99a1b3;
				font-size: 0.875rem;
			}
			.bench-swatch {
				width: 12px;
				height: 12px;
				border-radius: 3px;
				display: inline-block;
			}
			.bench-swatch-octane {
				background: #ff415a;
			}
			.bench-swatch-react {
				background: #3d8bfd;
			}
			.bench-sub {
				color: #99a1b3;
				margin: 0.5rem 0 1.75rem;
				max-width: 40rem;
			}
			.bench-grid {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 1.25rem;
			}
			@media (max-width: 900px) {
				.bench-grid {
					grid-template-columns: 1fr;
				}
			}
			.bench :global(figure.bench-card) {
				background: #2b3138;
				border: 1px solid rgba(255, 255, 255, 0.06);
				border-radius: 1rem;
				padding: 1.5rem;
				margin: 0;
			}
			.bench :global(figcaption.bench-card-title) {
				color: #f4eee8;
				font-weight: 600;
				font-size: 0.95rem;
				margin-bottom: 1.25rem;
				font-family: ui-monospace, Menlo, Consolas, monospace;
			}
			.bench :global(figure.bench-card svg) {
				width: 100%;
				height: auto;
				display: block;
			}
			.bench :global(text.bench-op) {
				fill: #99a1b3;
				font-size: 12px;
			}
			.bench :global(text.bench-val) {
				fill: #f4eee8;
				font-size: 11px;
				font-variant-numeric: tabular-nums;
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
