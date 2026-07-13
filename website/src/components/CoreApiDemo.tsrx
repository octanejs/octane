// A small, real Octane component embedded in the Core APIs guide. It gives
// newcomers an immediate connection between the source example, state, events,
// and the DOM that Octane updates.
import { useState } from 'octane';

export function CoreApiDemo() @{
	const [count, setCount] = useState(0);

	<section class="demo" aria-labelledby="demo-title">
		<div class="demo-bar">
			<div>
				<span class="demo-dot" aria-hidden="true"></span>
				<span class="demo-kicker">Live example</span>
			</div>
			<span class="demo-hint">Try the buttons</span>
		</div>
		<div class="demo-preview">
			<div class="demo-copy">
				<p id="demo-title" class="demo-title">Items packed</p>
				<p class="demo-description">
					The number is state. Each click updates it and renders again.
				</p>
			</div>
			<strong class="demo-count" aria-live="polite">
				{count as string}
			</strong>
			<div class="demo-actions">
				<button
					type="button"
					class="demo-button secondary"
					disabled={count === 0}
					onClick={() => setCount((current) => Math.max(0, current - 1))}
				>
					Remove one
				</button>
				<button
					type="button"
					class="demo-button primary"
					onClick={() => setCount((current) => current + 1)}
				>
					Add one
				</button>
			</div>
		</div>
		<style>
			.demo {
				margin: 0 0 1.5rem;
				border: 1px solid var(--border);
				border-radius: 1rem;
				overflow: hidden;
				background: var(--panel);
			}
			.demo-bar {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
				padding: 0.65rem 1rem;
				border-bottom: 1px solid var(--border);
				color: var(--text-secondary);
				font-size: 0.78rem;
				font-weight: 650;
				letter-spacing: 0.02em;
			}
			.demo-bar > div {
				display: flex;
				align-items: center;
				gap: 0.5rem;
			}
			.demo-dot {
				display: inline-block;
				width: 0.5rem;
				height: 0.5rem;
				border-radius: 999px;
				background: #63d391;
				box-shadow: 0 0 0 4px rgba(99, 211, 145, 0.12);
			}
			.demo-preview {
				display: grid;
				grid-template-columns: minmax(0, 1fr) auto;
				align-items: center;
				gap: 1.25rem 2rem;
				padding: 1.5rem;
				background:
					radial-gradient(circle at 92% 12%, rgba(255, 65, 90, 0.14), transparent 32%), var(--panel);
			}
			.demo-copy {
				min-width: 0;
			}
			.demo-title {
				margin: 0 0 0.15rem;
				color: var(--text);
				font-size: 1rem;
				font-weight: 750;
			}
			.demo-description {
				margin: 0;
				color: var(--text-secondary);
				font-size: 0.875rem;
			}
			.demo-count {
				min-width: 4.5rem;
				color: var(--text);
				font-size: clamp(2.75rem, 8vw, 4.5rem);
				font-variant-numeric: tabular-nums;
				letter-spacing: -0.08em;
				line-height: 1;
				text-align: right;
			}
			.demo-actions {
				grid-column: 1 / -1;
				display: flex;
				flex-wrap: wrap;
				gap: 0.65rem;
			}
			.demo-button {
				min-height: 2.5rem;
				border: 1px solid transparent;
				border-radius: 999px;
				padding: 0.5rem 1rem;
				font: inherit;
				font-size: 0.875rem;
				font-weight: 700;
				cursor: pointer;
				transition:
					background 0.15s,
					border-color 0.15s,
					transform 0.15s;
			}
			.demo-button:hover:not(:disabled) {
				transform: translateY(-1px);
			}
			.demo-button:focus-visible {
				outline: 2px solid var(--accent);
				outline-offset: 2px;
			}
			.demo-button.primary {
				background: var(--accent);
				color: white;
			}
			.demo-button.primary:hover {
				background: var(--accent-hover);
			}
			.demo-button.secondary {
				border-color: var(--border);
				background: rgba(255, 255, 255, 0.04);
				color: var(--text);
			}
			.demo-button.secondary:hover:not(:disabled) {
				background: rgba(255, 255, 255, 0.08);
			}
			.demo-button:disabled {
				opacity: 0.42;
				cursor: not-allowed;
			}
			@media (max-width: 520px) {
				.demo-hint {
					display: none;
				}
				.demo-preview {
					grid-template-columns: minmax(0, 1fr) auto;
					padding: 1.25rem;
				}
				.demo-actions {
					display: grid;
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}
				.demo-button {
					padding-inline: 0.75rem;
				}
			}
		</style>
	</section>
}
