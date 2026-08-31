// Both public React integration directions, using the same Shiki code pipeline
// as the docs. The selected panel owns its copy state so changing examples
// cannot leave a stale "Copied" message on the new sample.
import { useRef, useState } from 'octane';
import { Link } from '@octanejs/tanstack-router';
import OctaneSample from '../../../content/home-octanecompat-sample.mdx';
import ReactSample from '../../../content/home-reactcompat-sample.mdx';
import { useCopyToClipboard } from '../../../hooks/use-copy.ts';
import copyUrl from '../../../assets/copy.svg';
import checkUrl from '../../../assets/check.svg';

type Direction = 'react-in-octane' | 'octane-in-react';

export function ReactCompat() @{
	const [direction, setDirection] = useState<Direction>('react-in-octane');

	<section class="compat" aria-labelledby="compat-heading">
		<div class="compat-body">
			<div class="compat-copy">
				<h2 id="compat-heading" class="compat-title">
					{'Use React and Octane together. '}
					<span class="compat-accent">In either direction.</span>
				</h2>
				<p class="compat-lead">
					<code>ReactCompat</code>
					{' lets an Octane app keep using real React components. '}
					<code>OctaneCompat</code>
					{' lets a React app adopt compiled Octane components, one island at a time. ' +
						'Choose the boundary that fits your app.'}
				</p>
				<p class="compat-note">
					{'Both directions support SSR and hydration. Each renderer keeps its own ' +
						'events, and parent updates cross the boundary after commit. The guide ' +
						'covers context sharing, Suspense, and the limits.'}
				</p>
				<Link to="/docs/$slug" params={{ slug: 'react-compat' }} class="compat-link">
					Explore both React integrations →
				</Link>
			</div>

			<div class="compat-preview">
				<div class="compat-choices" role="group" aria-label="React integration example">
					<button
						type="button"
						class="compat-choice"
						aria-pressed={direction === 'react-in-octane'}
						aria-controls="compat-example"
						onClick={() => setDirection('react-in-octane')}
					>
						React in Octane
					</button>
					<button
						type="button"
						class="compat-choice"
						aria-pressed={direction === 'octane-in-react'}
						aria-controls="compat-example"
						onClick={() => setDirection('octane-in-react')}
					>
						Octane in React
					</button>
				</div>
				<CompatCode key={direction} direction={direction} />
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
			.compat-preview {
				margin-top: 2.5rem;
				min-width: 0;
			}
			.compat-choices {
				display: flex;
				gap: 0.5rem;
				margin-bottom: 0.75rem;
			}
			.compat-choice {
				flex: 1;
				padding: 0.65rem 0.75rem;
				border: 1px solid var(--border);
				border-radius: 0.6rem;
				background: transparent;
				color: var(--text-secondary);
				font: inherit;
				font-size: 0.85rem;
				cursor: pointer;
			}
			.compat-choice[aria-pressed='true'] {
				background: var(--surface);
				border-color: var(--accent);
				color: var(--text);
			}
			.compat-choice:focus-visible {
				outline: 2px solid var(--accent);
				outline-offset: 3px;
			}
			@media (min-width: 1000px) {
				.compat-body {
					max-width: none;
					display: grid;
					grid-template-columns: minmax(0, 30rem) minmax(0, 1fr);
					gap: 3.5rem;
					align-items: center;
				}
				.compat-preview {
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

function CompatCode(props: { direction: Direction }) @{
	const sampleEl = useRef<HTMLDivElement | null>(null);
	const { copied, copy } = useCopyToClipboard();
	const copySample = () => copy(sampleEl.current?.innerText ?? '');
	const reactInOctane = props.direction === 'react-in-octane';

	<div id="compat-example" class="compat-code">
		<div class="compat-code-bar">
			<span class="compat-dot compat-dot-r"></span>
			<span class="compat-dot compat-dot-y"></span>
			<span class="compat-dot compat-dot-g"></span>
			<span class="compat-code-name">
				{reactInOctane ? 'App.tsrx' : 'App.tsx'}
			</span>
			<button
				type="button"
				class="compat-code-copy"
				aria-label="Copy the selected integration sample"
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
			@if (reactInOctane) {
				<ReactSample />
			} @else {
				<OctaneSample />
			}
		</div>

		<style>
			/* The code panel is the hero's window chrome verbatim, so both editors on
			   the home page share the same frame, bar height, and traffic-light
			   placement. */
			.compat-code {
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
		</style>
	</div>
}
