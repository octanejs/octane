// A reusable code panel: a framed block with an optional title bar and one-click
// copy. The code itself is passed as `children` (a Shiki `<pre>`, an MDX sample,
// a bindings snippet …) and copy reads the rendered text straight off the code
// element, so there is no second copy of the source to drift out of sync.
//
// Variants control the chrome:
//   - `window` (default) — macOS traffic lights + filename + copy button. The
//     hero look; use it when the panel is a focal element.
//   - `plain` — a slim filename + copy header, no traffic lights. For docs, where
//     the window chrome would be too much.
//   - `bare` — no header at all; a floating copy button over the code. For short
//     inline snippets that only need copy.
//
// `footer` is an optional slot rendered inside the frame below the code (the hero
// passes its live demo there so it shares the panel's border and radius).
import { useRef } from 'octane';
import { useCopyToClipboard } from '../hooks/use-copy.ts';
import copyUrl from '../assets/copy.svg';
import checkUrl from '../assets/check.svg';

interface CodeBlockProps {
	children: unknown;
	filename?: string;
	// A short language tag (ts, tsx, bash …) shown in the header when there's no
	// filename — docs pass the fence language so each panel is labelled.
	language?: string;
	variant?: 'window' | 'plain' | 'bare';
	copy?: boolean;
	footer?: unknown;
}

export function CodeBlock(props: CodeBlockProps) @{
	const variant = props.variant ?? 'window';
	const showCopy = props.copy ?? true;
	const showBar = variant !== 'bare';
	const showBarCopy = showCopy && showBar;
	const showFloatCopy = showCopy && variant === 'bare';
	// A filename wins over the language tag; either is shown in the header's
	// left slot (the language reads lowercased, like the fence that produced it).
	const label = props.filename ?? props.language;

	// Copy pulls the visible text off the rendered code element, so it always
	// matches what the reader sees regardless of what produced the markup. The
	// ref sits on the inner code wrapper — NOT the outer body — so the floating
	// button's own "Copy"/"Copied" label never leaks into the copied text.
	const codeEl = useRef<HTMLDivElement | null>(null);
	const { copied, copy } = useCopyToClipboard();
	const copyCode = () => copy(codeEl.current?.innerText ?? '');

	<div class={['codeblock', 'codeblock-' + variant]}>
		@if (showBar) {
			<div class="codeblock-bar">
				@if (variant === 'window') {
					<>
						<span class="codeblock-dot codeblock-dot-r"></span>
						<span class="codeblock-dot codeblock-dot-y"></span>
						<span class="codeblock-dot codeblock-dot-g"></span>
					</>
				}
				@if (label) {
					<span class="codeblock-name">
						{label as string}
					</span>
				}
				@if (showBarCopy) {
					<button
						type="button"
						class="codeblock-copy codeblock-copy-bar"
						aria-label="Copy the code to the clipboard"
						onClick={copyCode}
					>
						<span
							class="codeblock-copy-icon"
							style={'--icon:url("' + (copied ? checkUrl : copyUrl) + '")'}
							aria-hidden="true"
						></span>
						<span>
							{copied ? 'Copied' : 'Copy'}
						</span>
					</button>
				}
			</div>
		}

		<div class="codeblock-body">
			<div class="codeblock-code" ref={codeEl}>{props.children}</div>
			@if (showFloatCopy) {
				<button
					type="button"
					class="codeblock-copy codeblock-copy-float"
					aria-label="Copy the code to the clipboard"
					onClick={copyCode}
				>
					<span
						class="codeblock-copy-icon"
						style={'--icon:url("' + (copied ? checkUrl : copyUrl) + '")'}
						aria-hidden="true"
					></span>
					<span>
						{copied ? 'Copied' : 'Copy'}
					</span>
				</button>
			}
			{props.footer}
		</div>

		<style>
			.codeblock {
				position: relative;
				background: var(--code-bg);
				border: 1px solid var(--border);
				border-radius: 1rem;
				overflow: hidden;
			}
			/* The window variant reads as a focal panel; plain/bare stay flatter. */
			.codeblock-window {
				box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
			}
			/* A tinted strip divided from the code by a hairline — the same header
			   treatment as the package-install panel, so the two read as siblings.
			   Both headers are pinned to the same min-height: 2rem (see .pkg-head,
			   whose tabs stretch to fill it), so they stay the same height regardless
			   of tab font size; keep the two values in step. */
			.codeblock-bar {
				display: flex;
				align-items: center;
				gap: 0.4rem;
				min-height: 2rem;
				padding: 0 0.5rem;
				border-bottom: 1px solid var(--border);
				background: var(--surface-subtle);
			}
			.codeblock-dot {
				width: 10px;
				height: 10px;
				border-radius: 50%;
				display: inline-block;
			}
			.codeblock-dot-r {
				background: #f47067;
			}
			.codeblock-dot-y {
				background: #dfab25;
			}
			.codeblock-dot-g {
				background: #57ab5a;
			}
			/* After the traffic lights (window) the name gets a little breathing room;
			   as the first item (plain) that margin is harmless. */
			.codeblock-name {
				margin-left: 0.5rem;
				color: var(--text-secondary);
				font-size: 0.8rem;
				font-family: ui-monospace, Menlo, Consolas, monospace;
			}
			.codeblock-body {
				position: relative;
			}
			.codeblock-copy {
				display: inline-flex;
				align-items: center;
				gap: 0.3rem;
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
			.codeblock-copy:hover {
				color: var(--text);
				background: var(--surface);
				border-color: var(--border);
			}
			/* In the bar the copy button is pushed to the trailing edge. */
			.codeblock-copy-bar {
				margin-left: auto;
			}
			/* Bare has no bar, so the button floats over the top-right of the code and
			   picks up the code panel's own fill on rest so it stays legible over any
			   token — theme-aware, so it doesn't go dark-on-dark in light mode. */
			.codeblock-copy-float {
				position: absolute;
				top: 0.55rem;
				right: 0.6rem;
				background: var(--code-bg);
			}
			.codeblock-copy-icon {
				width: 15px;
				height: 15px;
				flex: none;
				background: currentColor;
				mask: var(--icon) center / contain no-repeat;
				-webkit-mask: var(--icon) center / contain no-repeat;
			}
			/* The child <pre> (Shiki or otherwise) carries its own frame; normalize it
			   to sit flush inside the panel. Type size/padding is left to the global
			   pre.shiki default so each consumer can tighten it as needed. */
			.codeblock-code :global(pre) {
				margin: 0;
				border: none;
				border-radius: 0;
			}
		</style>
	</div>
}
