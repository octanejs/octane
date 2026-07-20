// Hero: the pitch, the two calls to action, and the Counter.tsrx sample — with
// the live twin of that sample (HeroDemo) running underneath it. The sample is
// an .mdx module so it rides the same Shiki pipeline as the docs.
import { useRef } from 'octane';
import { Link } from '@octanejs/tanstack-router';
import CodeSample from '../../../content/home-sample.mdx';
import { HeroDemo } from '../../../components/HeroDemo.tsrx';
import { useCopyToClipboard } from '../../../hooks/use-copy.ts';
import copyUrl from '../../../assets/copy.svg';
import checkUrl from '../../../assets/check.svg';

export function Hero() @{
	// Copy the sample straight off the rendered Shiki block — no second copy of
	// the source to drift out of sync with content/home-sample.mdx.
	const sampleEl = useRef<HTMLDivElement | null>(null);
	const { copied, copy } = useCopyToClipboard();
	const copySample = () => copy(sampleEl.current?.innerText ?? '');

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
					'No hand-maintained dependency arrays — the compiler works out what your ' +
					'code captures for you.'}
			</p>
			<div class="hero-actions">
				<Link to="/docs/$slug" params={{ slug: 'quick-start' }} class="btn-primary">
					Get started
				</Link>
				<Link to="/docs/$slug" params={{ slug: 'differences-from-react' }} class="btn-ghost">
					Differences from React
				</Link>
			</div>
		</div>
		<div class="hero-code">
			<div class="hero-code-bar">
				<span class="dot dot-r"></span>
				<span class="dot dot-y"></span>
				<span class="dot dot-g"></span>
				<span class="hero-code-name">Counter.tsrx</span>
				<button
					type="button"
					class="code-copy"
					aria-label="Copy the sample to the clipboard"
					onClick={copySample}
				>
					<span
						class="code-copy-icon"
						style={'--icon:url("' + (copied ? checkUrl : copyUrl) + '")'}
						aria-hidden="true"
					></span>
					<span>
						{copied ? 'Copied' : 'Copy'}
					</span>
				</button>
			</div>
			<div class="hero-code-body" ref={sampleEl}>
				<CodeSample />
			</div>
			<HeroDemo />
		</div>

		<style>
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
				color: var(--accent);
			}
			.hero-sub {
				color: var(--text-secondary);
				font-size: 1.25rem;
				margin: 0 0 2rem;
				max-width: 34rem;
			}
			.hero-sub a {
				color: var(--text);
				font-weight: 600;
			}
			.hero-sub a:hover {
				color: var(--accent-hover);
			}
			.hero-actions {
				display: flex;
				gap: 0.75rem;
				flex-wrap: wrap;
			}
			.hero-actions :global(a.btn-primary) {
				background: var(--accent);
				color: var(--on-accent);
				font-weight: 600;
				padding: 0.7rem 1.4rem;
				border-radius: 9999px;
				transition: background 0.15s;
			}
			.hero-actions :global(a.btn-primary:hover) {
				background: var(--accent-hover);
				text-decoration: none;
			}
			.hero-actions :global(a.btn-ghost) {
				color: var(--text);
				font-weight: 600;
				padding: 0.7rem 1.4rem;
				border-radius: 9999px;
				border: 1px solid var(--border);
				transition: background 0.15s;
			}
			.hero-actions :global(a.btn-ghost:hover) {
				background: var(--surface);
				text-decoration: none;
			}
			.hero-code {
				background: var(--code-bg);
				border: 1px solid var(--border);
				border-radius: 1rem;
				overflow: hidden;
				box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
			}
			.hero-code-bar {
				display: flex;
				align-items: center;
				gap: 0.4rem;
				padding: 0.6rem 1rem;
				border-bottom: 1px solid var(--border);
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
				color: var(--text-secondary);
				font-size: 0.8rem;
				font-family: ui-monospace, Menlo, Consolas, monospace;
			}
			.code-copy {
				display: inline-flex;
				align-items: center;
				gap: 0.3rem;
				margin-left: auto;
				padding: 0.2rem 0.5rem;
				border: 1px solid transparent;
				border-radius: 0.5rem;
				background: transparent;
				color: var(--text-secondary);
				font: inherit;
				font-size: 0.75rem;
				cursor: pointer;
				transition:
					background 0.15s,
					color 0.15s,
					border-color 0.15s;
			}
			.code-copy:hover {
				color: var(--text);
				background: var(--surface);
				border-color: var(--border);
			}
			.code-copy-icon {
				width: 15px;
				height: 15px;
				flex: none;
				background: currentColor;
				mask: var(--icon) center / contain no-repeat;
				-webkit-mask: var(--icon) center / contain no-repeat;
			}
			/* Shiki's <pre> carries its own frame; the wrapper only exists to give
			   the copy button something to read the source text from. Tighter type
			   here keeps the whole panel — code plus the live strip — in view. */
			.hero-code-body :global(pre.shiki) {
				margin: 0;
				border: none;
				border-radius: 0;
				padding: 0.9rem 1.1rem;
				font-size: 0.8rem;
				line-height: 1.5;
			}
		</style>
	</section>
}
