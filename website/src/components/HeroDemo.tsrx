// The live twin of the hero's code sample (content/home-sample.mdx): the same
// component, running. Its `useEffect` sits behind the same `if (!props.paused)`
// condition the sample shows — and logs to the console exactly as the sample
// promises, plus a visible log line so "a hook can sit behind a condition" is
// something the reader can watch happen without opening devtools. Toggle
// `paused` and the effect stops firing while the state hook below it keeps its
// slot.
import { useState, useEffect } from 'octane';

function Counter(props: { paused: boolean; onLog: (message: string) => void }) @{
	const [count, setCount] = useState(0);

	if (!props.paused) {
		useEffect(() => {
			console.log('count is now', count);
			props.onLog('count is now ' + count);
		}); // the compiler infers [count]
	}

	// Scoped styles are per-component, so the button's CSS lives HERE: in
	// HeroDemo's <style> the hashed selector would never match this node.
	<button type="button" class="demo-count" onClick={() => setCount(count + 1)}>
		<span class="demo-count-label">Count</span>
		<span class="demo-count-value">
			{count as string}
		</span>

		<style>
			.demo-count {
				display: inline-flex;
				align-items: center;
				gap: 0.5rem;
				flex: none;
				padding: 0.3rem 0.35rem 0.3rem 0.85rem;
				border: 1px solid rgba(255, 65, 90, 0.5);
				border-radius: 9999px;
				background: linear-gradient(180deg, rgba(255, 93, 114, 0.28), rgba(255, 65, 90, 0.16));
				color: var(--text);
				font: inherit;
				font-size: 0.85rem;
				font-weight: 600;
				line-height: 1.4;
				cursor: pointer;
				transition:
					background 0.15s,
					border-color 0.15s,
					transform 0.1s,
					box-shadow 0.15s;
			}
			.demo-count:hover {
				border-color: rgba(255, 93, 114, 0.8);
				background: linear-gradient(180deg, rgba(255, 93, 114, 0.38), rgba(255, 65, 90, 0.24));
				box-shadow: 0 4px 16px rgba(255, 65, 90, 0.25);
			}
			.demo-count:active {
				transform: translateY(1px);
				box-shadow: none;
			}
			.demo-count:focus-visible {
				outline: 2px solid var(--accent-hover);
				outline-offset: 2px;
			}
			/* The value sits in its own pill and is tabular, so the button does not
			   twitch as the count grows from 9 to 10. */
			.demo-count-value {
				min-width: 1.75rem;
				padding: 0.05rem 0.4rem;
				border-radius: 9999px;
				background: rgba(0, 0, 0, 0.35);
				color: #fff;
				font-family: ui-monospace, Menlo, Consolas, monospace;
				font-size: 0.8rem;
				font-variant-numeric: tabular-nums;
				text-align: center;
			}
		</style>
	</button>
}

export function HeroDemo() @{
	const [paused, setPaused] = useState(false);
	const [log, setLog] = useState('count is now 0');

	<div class="demo">
		<span class="demo-badge">Live</span>
		<Counter paused={paused} onLog={setLog} />
		<label class="demo-toggle">
			<input
				type="checkbox"
				checked={paused}
				onInput={(event: Event) => setPaused((event.target as HTMLInputElement).checked)}
			/>
			<span>paused</span>
		</label>
		<code class="demo-log">
			{paused ? '// effect skipped' : '// ' + log}
		</code>

		<style>
			.demo {
				display: flex;
				align-items: center;
				gap: 0.75rem;
				padding: 0.75rem 1rem;
				border-top: 1px solid rgba(255, 255, 255, 0.08);
				background: rgba(255, 255, 255, 0.02);
			}
			.demo-badge {
				flex: none;
				padding: 0.1rem 0.4rem;
				border-radius: 0.35rem;
				background: rgba(255, 65, 90, 0.16);
				color: var(--accent-text);
				font-size: 0.65rem;
				font-weight: 700;
				letter-spacing: 0.06em;
				text-transform: uppercase;
			}
			.demo-toggle {
				display: inline-flex;
				align-items: center;
				gap: 0.35rem;
				flex: none;
				color: var(--text-secondary);
				font-size: 0.8rem;
				cursor: pointer;
				user-select: none;
			}
			.demo-toggle input {
				accent-color: var(--accent);
				cursor: pointer;
			}
			.demo-log {
				min-width: 0;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				color: var(--text-secondary);
				font-size: 0.78rem;
				opacity: 0.85;
			}
		</style>
	</div>
}
