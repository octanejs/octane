// The live twin of the hero's code sample (content/home-sample.mdx): the same
// component, running. Its `useEffect` sits behind the same `if (!props.paused)`
// condition the sample shows — and logs to the console exactly as the sample
// promises, plus a bounded effect console so "a hook can sit behind a condition"
// is something the reader can watch happen without opening devtools. Toggle
// `paused` and the effect console stops receiving lines while the state hook
// below it keeps its slot.
import { useCallback, useEffect, useRef, useState } from 'octane';

const MAX_TERMINAL_ENTRIES = 50;
const TERMINAL_BOTTOM_TOLERANCE = 4;

interface TerminalEntry {
	id: number;
	message: string;
}

function Counter(props: {
	paused: boolean;
	onIncrement: () => void;
	onLog: (message: string) => void;
}) @{
	const [count, setCount] = useState(0);

	if (!props.paused) {
		useEffect(() => {
			console.log('count is now', count);
			props.onLog('count is now ' + count);
		}); // the compiler infers [count]
	}

	// Scoped styles are per-component, so the button's CSS lives HERE: in
	// HeroDemo's <style> the hashed selector would never match this node.
	<button
		type="button"
		class="demo-count"
		onClick={() => {
			props.onIncrement();
			setCount(count + 1);
		}}
	>
		<span class="demo-count-label">Count</span>
		<span class="demo-count-value">{`${count}`}</span>

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
				background: rgba(0, 0, 0, 0.5);
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
	const [entries, setEntries] = useState<TerminalEntry[]>([]);
	const [followingTail, setFollowingTail] = useState(true);
	const terminalRef = useRef<HTMLDivElement | null>(null);
	const nextEntryId = useRef(0);

	const appendLog = useCallback((message: string) => {
		const entry = { id: nextEntryId.current++, message };
		setEntries((current) => [...current, entry].slice(-MAX_TERMINAL_ENTRIES));
	});

	const newestEntry = entries.at(-1);
	useEffect(() => {
		if (!newestEntry || !followingTail) return;
		const terminal = terminalRef.current;
		if (terminal) terminal.scrollTop = terminal.scrollHeight;
	});

	const onTerminalScroll = (event: Event) => {
		const terminal = event.currentTarget as HTMLDivElement;
		const distanceFromBottom = terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight;
		const atBottom = distanceFromBottom <= TERMINAL_BOTTOM_TOLERANCE;
		setFollowingTail(atBottom);
	};

	const jumpToLatest = () => {
		setFollowingTail(true);
		const terminal = terminalRef.current;
		if (terminal) terminal.scrollTop = terminal.scrollHeight;
	};

	<div class="demo-shell">
		<div class="demo">
			<span class="demo-badge">Live</span>
			<Counter paused={paused} onIncrement={jumpToLatest} onLog={appendLog} />
			<label class="demo-toggle">
				<input
					type="checkbox"
					checked={paused}
					onInput={(event: Event) => setPaused((event.currentTarget as HTMLInputElement).checked)}
				/>
				<span>Pause effect</span>
			</label>
		</div>

		<section class="demo-terminal" aria-label="Console">
			<header class="demo-terminal-header">
				<span class="demo-terminal-title">Console</span>
				<span class={['demo-terminal-status', paused ? 'paused' : 'running']}>{(paused
					? 'Effect paused'
					: 'Effect active') as string}</span>
				@if (!followingTail) {
					<button type="button" class="demo-terminal-jump" onClick={jumpToLatest}>
						Latest ↓
					</button>
				}
			</header>
			<div
				class="demo-terminal-body"
				ref={terminalRef}
				role="log"
				aria-live="polite"
				aria-relevant="additions"
				tabIndex={0}
				onScroll={onTerminalScroll}
			>
				@for (const entry of entries; key entry.id) {
					<code class="demo-terminal-line">
						<span class="demo-terminal-prompt" aria-hidden="true">›</span>
						<span>{entry.message as string}</span>
					</code>
				} @empty {
					<span class="demo-terminal-empty">Waiting for the effect…</span>
				}
			</div>
		</section>

		<style>
			.demo-shell {
				border-top: 1px solid var(--border);
				background: var(--surface-subtle);
			}
			.demo {
				display: flex;
				align-items: center;
				gap: 0.75rem;
				padding: 0.75rem 1rem;
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
			.demo-terminal {
				border-top: 1px solid var(--border);
				background: rgba(7, 9, 12, 0.72);
			}
			.demo-terminal-header {
				display: flex;
				align-items: center;
				gap: 0.55rem;
				height: 2rem;
				padding: 0.35rem 0.85rem;
				border-bottom: 1px solid rgba(255, 255, 255, 0.055);
			}
			.demo-terminal-title {
				color: var(--text-secondary);
				font-size: 0.6rem;
				font-weight: 700;
				letter-spacing: 0.08em;
				text-transform: uppercase;
			}
			.demo-terminal-status {
				display: inline-flex;
				align-items: center;
				gap: 0.3rem;
				margin-left: auto;
				color: var(--text-secondary);
				font-size: 0.62rem;
				font-weight: 600;
				letter-spacing: 0.04em;
				text-transform: uppercase;
			}
			.demo-terminal-status::before {
				content: '';
				width: 0.38rem;
				height: 0.38rem;
				border-radius: 9999px;
				background: #57ab5a;
				box-shadow: 0 0 0.45rem rgba(87, 171, 90, 0.55);
			}
			.demo-terminal-status.paused::before {
				background: #dfab25;
				box-shadow: none;
			}
			.demo-terminal-jump {
				height: 1.25rem;
				padding: 0 0.42rem;
				border: 1px solid var(--border);
				border-radius: 9999px;
				background: var(--surface);
				color: var(--text-secondary);
				font: inherit;
				font-size: 0.62rem;
				line-height: 1;
				cursor: pointer;
			}
			.demo-terminal-jump:hover {
				color: var(--text);
				border-color: var(--accent);
			}
			.demo-terminal-jump:focus-visible,
			.demo-terminal-body:focus-visible {
				outline: 2px solid var(--accent-hover);
				outline-offset: -2px;
			}
			.demo-terminal-body {
				height: 4.75rem;
				overflow-y: auto;
				overscroll-behavior: contain;
				scrollbar-gutter: stable;
				scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
				scrollbar-width: thin;
				padding: 0.45rem 0.85rem;
				color: #d6deeb;
				font-family: ui-monospace, Menlo, Consolas, monospace;
				font-size: 0.72rem;
				line-height: 1.55;
			}
			.demo-terminal-body::-webkit-scrollbar {
				width: 0.65rem;
			}
			.demo-terminal-body::-webkit-scrollbar-track {
				background: transparent;
			}
			.demo-terminal-body::-webkit-scrollbar-thumb {
				border: 3px solid transparent;
				border-radius: 9999px;
				background: rgba(255, 255, 255, 0.2);
				background-clip: padding-box;
			}
			.demo-terminal-body::-webkit-scrollbar-thumb:hover {
				background: rgba(255, 255, 255, 0.34);
				background-clip: padding-box;
			}
			.demo-terminal-line {
				display: flex;
				gap: 0.45rem;
				min-width: max-content;
				animation: terminal-line-in 0.14s ease-out;
			}
			.demo-terminal-prompt {
				color: var(--accent-text);
				font-weight: 700;
			}
			.demo-terminal-empty {
				color: var(--text-secondary);
				opacity: 0.65;
			}
			@keyframes terminal-line-in {
				from {
					opacity: 0;
					transform: translateY(0.2rem);
				}
				to {
					opacity: 1;
					transform: translateY(0);
				}
			}
			@media (max-width: 560px) {
				.demo {
					flex-wrap: wrap;
				}
			}
			@media (prefers-reduced-motion: reduce) {
				.demo-terminal-line {
					animation: none;
				}
			}
		</style>
	</div>
}
