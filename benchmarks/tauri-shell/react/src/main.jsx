// No StrictMode: its double-invoke is a development aid, and Octane has no
// equivalent, so enabling it here would compare different amounts of work.
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
	ROW_COUNT,
	ROW_PASSES,
	appendCapped,
	buildRows,
	nextPaint,
	yieldTurn,
	report,
	runStream,
	swapRows,
	timeCommit,
	updateEveryTenth,
} from '@benchmarks/tauri-shell-harness';
import './styles.css';

let renders = 0;

// Preserve exact render diagnostics without preventing component compilation.
function recordRender() {
	renders++;
}

function App() {
	recordRender();
	const [rows, setRows] = useState([]);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			// performance.now() is measured from navigation start, so the first
			// presented frame IS the cold start a desktop user waits through:
			// webview navigation, module parse and execute, and the first mount.
			await nextPaint();
			const bootMs = performance.now();
			if (cancelled) return;

			const rendersBeforeStream = renders;
			const streamMs = await runStream((tick, done) => {
				setRows((current) => appendCapped(current, tick));
				if (tick.done) done();
			});
			if (cancelled) return;
			const rendersAfterStream = renders;

			flushSync(() => setRows([]));
			const rendersBeforeSync = renders;
			const streamSyncMs = await runStream((tick, done) => {
				flushSync(() => setRows((current) => appendCapped(current, tick)));
				if (tick.done) done();
			});
			const rendersAfterSync = renders;

			flushSync(() => setRows([]));
			await nextPaint();

			const create = [];
			const update = [];
			const swap = [];
			const clear = [];
			for (let pass = 0; pass < ROW_PASSES; pass++) {
				// Each array is built OUTSIDE the timed region. That work is identical
				// shared code, so including it would add the same constant to every
				// column and blunt the ratio the op exists to show.
				let next = buildRows(ROW_COUNT);
				create.push(timeCommit(flushSync, () => setRows(next)));
				await yieldTurn();

				next = updateEveryTenth(next);
				update.push(timeCommit(flushSync, () => setRows(next)));
				await yieldTurn();

				next = swapRows(next);
				swap.push(timeCommit(flushSync, () => setRows(next)));
				await yieldTurn();

				clear.push(timeCommit(flushSync, () => setRows([])));
				await yieldTurn();
			}

			await report({
				target: 'react',
				boot_ms: bootMs,
				stream_async_ms: streamMs,
				stream_async_renders: rendersAfterStream - rendersBeforeStream,
				stream_sync_ms: streamSyncMs,
				stream_sync_renders: rendersAfterSync - rendersBeforeSync,
				create_ms: create,
				update_ms: update,
				swap_ms: swap,
				clear_ms: clear,
			});
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<main>
			<h1>Tauri shell benchmark</h1>
			<ol className="log">
				{rows.map((row) => (
					<li key={row.seq}>
						<span className="seq">{String(row.seq)}</span>
						<span className="text">{row.text}</span>
					</li>
				))}
			</ol>
		</main>
	);
}

const target = document.getElementById('root');
if (target === null) throw new Error('benchmark host requires a #root element');

createRoot(target).render(<App />);
