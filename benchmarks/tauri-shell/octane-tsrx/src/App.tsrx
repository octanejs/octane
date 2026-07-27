import { flushSync, useEffect, useState } from 'octane';
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

interface Row {
	seq: number;
	text: string;
	done?: boolean;
}

let renders = 0;

export function App() @{
	renders++;
	const [rows, setRows] = useState<Row[]>([]);

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
			const streamMs = await runStream((tick: Row, done: () => void) => {
				setRows((current) => appendCapped(current, tick));
				if (tick.done) done();
			});
			if (cancelled) return;
			const rendersAfterStream = renders;

			flushSync(() => setRows([]));
			const rendersBeforeSync = renders;
			const streamSyncMs = await runStream((tick: Row, done: () => void) => {
				flushSync(() => setRows((current) => appendCapped(current, tick)));
				if (tick.done) done();
			});
			const rendersAfterSync = renders;

			flushSync(() => setRows([]));
			await nextPaint();

			const create: number[] = [];
			const update: number[] = [];
			const swap: number[] = [];
			const clear: number[] = [];
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
				target: 'octane-tsrx',
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

	<main>
		<h1>Tauri shell benchmark</h1>
		<ol class="log">
			@for (const row of rows; key row.seq) {
				<li>
					<span class="seq">{String(row.seq)}</span>
					<span class="text">{row.text as string}</span>
				</li>
			}
		</ol>
	</main>
}
