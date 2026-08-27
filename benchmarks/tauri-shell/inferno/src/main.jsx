import { Component, render, rerender } from 'inferno';
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
const flushSync = (callback) => {
	callback();
	rerender();
};

class App extends Component {
	constructor(props) {
		super(props);
		this.state = { rows: [] };
		this.cancelled = false;
	}

	componentDidMount() {
		void this.run();
	}

	componentWillUnmount() {
		this.cancelled = true;
	}

	setRows = (update) => {
		this.setState(({ rows }) => ({ rows: typeof update === 'function' ? update(rows) : update }));
	};

	async run() {
		await nextPaint();
		const bootMs = performance.now();
		if (this.cancelled) return;

		const rendersBeforeStream = renders;
		const streamMs = await runStream((tick, done) => {
			this.setRows((current) => appendCapped(current, tick));
			if (tick.done) done();
		});
		if (this.cancelled) return;
		const rendersAfterStream = renders;

		flushSync(() => this.setRows([]));
		const rendersBeforeSync = renders;
		const streamSyncMs = await runStream((tick, done) => {
			flushSync(() => this.setRows((current) => appendCapped(current, tick)));
			if (tick.done) done();
		});
		const rendersAfterSync = renders;

		flushSync(() => this.setRows([]));
		await nextPaint();

		const create = [];
		const update = [];
		const swap = [];
		const clear = [];
		for (let pass = 0; pass < ROW_PASSES; pass++) {
			let next = buildRows(ROW_COUNT);
			create.push(timeCommit(flushSync, () => this.setRows(next)));
			await yieldTurn();

			next = updateEveryTenth(next);
			update.push(timeCommit(flushSync, () => this.setRows(next)));
			await yieldTurn();

			next = swapRows(next);
			swap.push(timeCommit(flushSync, () => this.setRows(next)));
			await yieldTurn();

			clear.push(timeCommit(flushSync, () => this.setRows([])));
			await yieldTurn();
		}

		await report({
			target: 'inferno',
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
	}

	render() {
		renders++;
		return (
			<main>
				<h1>Tauri shell benchmark</h1>
				<ol className="log">
					{this.state.rows.map((row) => (
						<li key={row.seq}>
							<span className="seq">{String(row.seq)}</span>
							<span className="text">{row.text}</span>
						</li>
					))}
				</ol>
			</main>
		);
	}
}

const target = document.getElementById('root');
if (target === null) throw new Error('benchmark host requires a #root element');
render(<App />, target);
