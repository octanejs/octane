// The React-interop section: the "you don't have to rewrite" pitch, sitting
// between the "why" prose and the 3D flame demo. It shows the whole migration
// story in one snippet — a real React app hosting a compiled Octane island
// through `<OctaneCompat>` (octane/react) — and points at the full guide. The
// code panel mirrors the hero's bespoke window chrome (rather than the docs
// CodeBlock) so the two panels on the home page read as the same editor; the
// sample itself is an .mdx module on the shared Shiki pipeline, so there is no
// second copy of the source to drift.
import { useRef } from 'octane';
import { Link } from '@octanejs/tanstack-router';
import CodeSample from '../../../content/home-octanecompat-sample.mdx';
import { useCopyToClipboard } from '../../../hooks/use-copy.ts';
import copyUrl from '../../../assets/copy.svg';
import checkUrl from '../../../assets/check.svg';

export function ReactCompat() @{
	// Copy the sample straight off the rendered Shiki block — no second copy of
	// the source to drift out of sync with the .mdx module.
	const sampleEl = useRef<HTMLDivElement | null>(null);
	const { copied, copy } = useCopyToClipboard();
	const copySample = () => copy(sampleEl.current?.innerText ?? '');

	<section class="compat" aria-labelledby="compat-heading">
		<div class="compat-body">
			<div class="compat-copy">
				<h2 id="compat-heading" class="compat-title">
					{'Incrementally migrate. '}
					<span class="compat-accent">With OctaneCompat.</span>
				</h2>
				<p class="compat-lead">
					{'Already have a React 19 app? Drop compiled Octane islands into it with a ' +
						'single component. Events stay native and delegated, islands read your real ' +
						'React context with plain '}
					<code>use()</code>
					{', and they render on the server and hydrate on the client. Migrate one ' +
						'component at a time — no rewrite, no big bang.'}
				</p>
				<p class="compat-note">
					{'The one thing that doesn’t cross over: React Server Components. Everything ' +
						'else — hooks, Suspense, context, SSR — comes along.'}
				</p>
				<Link to="/docs/$slug" params={{ slug: 'react-compat' }} class="compat-link">
					Read the OctaneCompat guide →
				</Link>
			</div>

			<div class="compat-code">
				<div class="compat-code-bar">
					<span class="compat-dot compat-dot-r"></span>
					<span class="compat-dot compat-dot-y"></span>
					<span class="compat-dot compat-dot-g"></span>
					<span class="compat-code-name">App.tsx</span>
					<button
						type="button"
						class="compat-code-copy"
						aria-label="Copy the sample to the clipboard"
						onClick={copySample}
					>
						<span
							class="compat-code-copy-icon"
							style={'--icon:url("' + (copied ? checkUrl : copyUrl) + '")'}
							aria-hidden="true"
						></span>
						<span>
							{copied ? 'Copied' : 'Copy'}
						</span>
					</button>
				</div>
				<div class="compat-code-body" ref={sampleEl}>
					<CodeSample />
				</div>
			</div>
		</div>

		<style>
			/* Shares the hairline top border the other lower sections use. */
			.compat {
				border-top: 1px solid var(--border);
				padding: 4rem 0;
				margin-top: 2rem;
			}
			/* When stacked, keep the same 48rem measure as the prose sections above
			   so the column's left/right edges line up with them. The wide-screen
			   two-column grid drops this cap. */
			.compat-body {
				max-width: 48rem;
			}
			.compat-title {
				font-size: 2.4rem;
				line-height: 1.12;
				letter-spacing: -0.03em;
				margin: 0;
				font-weight: 800;
				scroll-margin-top: 5.5rem;
			}
			.compat-accent {
				display: block;
				color: var(--accent);
			}
			.compat-lead {
				margin: 1.5rem 0 0;
				color: var(--text-secondary);
				font-size: 1.02rem;
				line-height: 1.6;
			}
			.compat-lead code {
				font-family: ui-monospace, Menlo, Consolas, monospace;
				font-size: 0.9em;
				color: var(--text);
			}
			.compat-note {
				margin: 1rem 0 0;
				color: var(--text-secondary);
				font-size: 0.95rem;
				line-height: 1.6;
			}
			/* The Link component renders its own <a>, so a scoped class selector never
			   lands on it — target it through :global, the same way the why-coda link
			   is styled. Without this the anchor falls back to the global bare-link
			   style (accent colour, no underline). */
			.compat-copy :global(a.compat-link) {
				display: inline-block;
				margin-top: 1.5rem;
				color: var(--accent-text);
				text-decoration: underline;
				text-underline-offset: 0.16em;
				white-space: nowrap;
			}
			/* The code panel is the hero's window chrome verbatim, so both editors on
			   the home page share the same frame, bar height, and traffic-light
			   placement. */
			.compat-code {
				margin-top: 2.5rem;
				background: var(--code-bg);
				border: 1px solid var(--border);
				border-radius: 1rem;
				overflow: hidden;
				box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
			}
			.compat-code-bar {
				display: flex;
				align-items: center;
				gap: 0.4rem;
				padding: 0.6rem 1rem;
				border-bottom: 1px solid var(--border);
			}
			.compat-dot {
				width: 10px;
				height: 10px;
				border-radius: 50%;
				display: inline-block;
			}
			.compat-dot-r {
				background: #f47067;
			}
			.compat-dot-y {
				background: #dfab25;
			}
			.compat-dot-g {
				background: #57ab5a;
			}
			.compat-code-name {
				margin-left: 0.5rem;
				color: var(--text-secondary);
				font-size: 0.8rem;
				font-family: ui-monospace, Menlo, Consolas, monospace;
			}
			.compat-code-copy {
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
			.compat-code-copy:hover {
				color: var(--text);
				background: var(--surface);
				border-color: var(--border);
			}
			.compat-code-copy-icon {
				width: 15px;
				height: 15px;
				flex: none;
				background: currentColor;
				mask: var(--icon) center / contain no-repeat;
				-webkit-mask: var(--icon) center / contain no-repeat;
			}
			/* Shiki's <pre> carries its own frame; normalize it to sit flush inside
			   the panel, matching the hero's Shiki block exactly. */
			.compat-code-body :global(pre.shiki) {
				margin: 0;
				border: none;
				border-radius: 0;
				padding: 0.9rem 1.1rem;
				font-size: 0.8rem;
				line-height: 1.5;
			}
			@media (min-width: 1000px) {
				.compat-body {
					max-width: none;
					display: grid;
					grid-template-columns: minmax(0, 30rem) minmax(0, 1fr);
					gap: 3.5rem;
					align-items: center;
				}
				.compat-code {
					margin-top: 0;
				}
			}
			@media (max-width: 560px) {
				.compat {
					padding: 3rem 0;
				}
				.compat-title {
					font-size: 2rem;
				}
			}
		</style>
	</section>
}
