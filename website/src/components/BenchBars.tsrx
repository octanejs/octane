// A benchmark card: an operation picker and one labeled horizontal bar per
// framework for the picked operation — the same plain-div bar view the
// benchmark explorer's first panel uses, so the two charts read identically
// (lower is better, sorted fastest-first). The picker opens on "overall", the
// card's summary reading: each framework's geometric mean across operations,
// × vs the reference series. Single-series cards have nothing to compare per
// operation, so they chart every operation as its own bar instead. The <details> table
// with the exact numbers for every operation stays as the accessibility/relief
// channel for the color encoding. The default view is deterministic from the
// checked-in card, so the server and client render the same markup and
// hydration adopts the real chart instead of replacing a chart shell.
import { useMemo, useState } from 'octane';
import type { BenchCard } from '../content/benchmarks.ts';

function fmt(value: unknown): string {
	const n =
		typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) return '—';
	// A literal 0 is a sub-timer-resolution measurement — show it as plain 0,
	// not a misleading "0.00".
	if (n === 0) return '0';
	if (n >= 10) return String(Math.round(n));
	if (n >= 1) return n.toFixed(1);
	return n.toFixed(2);
}

// ×-vs-Octane ratios (format: 'x'): 15.35 → "15×", 2.99 → "3.0×", 0.73 → "0.73×".
function fmtX(value: unknown): string {
	const n =
		typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) return '—';
	if (n >= 10) return Math.round(n) + '×';
	if (n >= 1) return (n === Math.round(n) ? String(n) : n.toFixed(1)) + '×';
	return n.toFixed(2) + '×';
}

function fmtBytes(value: unknown): string {
	const n =
		typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) return '—';
	if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
	if (n >= 1024) return Math.round(n / 1024) + ' kB';
	return Math.round(n) + ' B';
}

// Bar labels drop trailing version tokens ("React 19" → "React") — the full
// versioned label stays in the data table header.
function shortLabel(label: string): string {
	return label.replace(/\s+[\d][\d.]*.*$/, '');
}

// The picker's synthetic first entry — no suite has an operation named this.
const OVERALL_OP = 'overall';

interface BarItem {
	key: string;
	label: string;
	value: number;
	color: string;
}

interface BarView {
	present: BarItem[];
	missing: Array<{ key: string; label: string }>;
	scaleMax: number;
}

function barView(present: BarItem[], missing: BarView['missing']): BarView {
	present.sort((a, b) => a.value - b.value);
	let max = 0;
	for (const item of present) max = Math.max(max, item.value);
	// 1.05 headroom keeps the longest bar off the card edge; an all-zero row
	// (sub-timer-resolution scores) falls back to 1 so fractions stay finite.
	return { present, missing, scaleMax: max > 0 ? max * 1.05 : 1 };
}

export function BenchBars(props: { card: BenchCard }) @{
	const { card } = props;
	const format =
		card.format === 'x'
			? fmtX
			: card.format === 'bytes'
				? fmtBytes
				: fmt;
	const tableCaption =
		card.format === 'x'
			? 'Data table (× vs Octane, geometric mean across operations)'
			: card.format === 'bytes'
				? 'Data table (production build bytes)'
				: 'Data table (score ms, ' + card.iterations + ' iterations)';
	// Multi-series cards compare frameworks within one operation at a time —
	// opening on the "overall" summary (each series' geometric mean across the
	// card's operations, × vs the first series). Single-series cards compare
	// their operations against each other instead.
	const compare = card.series.length > 1;
	const [op, setOp] = useState(OVERALL_OP);
	const overall = compare && op === OVERALL_OP;

	const bars = useMemo(() => {
		if (!compare) {
			const only = card.series[0];
			const present: BarItem[] = [];
			for (const row of card.rows) {
				const value = row[only.key];
				if (typeof value === 'number') present.push({
					key: row.op as string,
					label: row.op as string,
					value,
					color: only.color,
				});
			}
			return barView(present, []);
		}
		const present: BarItem[] = [];
		const missing: Array<{ key: string; label: string }> = [];
		if (op === OVERALL_OP) {
			// Rows where either side is missing or zero (unsupported combinations,
			// sub-timer-resolution scores) drop out of that series' mean.
			const reference = card.series[0];
			for (const s of card.series) {
				const ratios: number[] = [];
				for (const row of card.rows) {
					const base = row[reference.key];
					const value = row[s.key];
					if (typeof base === 'number' && base > 0 && typeof value === 'number' && value > 0) {
						ratios.push(value / base);
					}
				}
				if (ratios.length > 0) present.push({
					key: s.key,
					label: shortLabel(s.label),
					value: Math.exp(ratios.reduce((sum, r) => sum + Math.log(r), 0) / ratios.length),
					color: s.color,
				});
				else missing.push({ key: s.key, label: shortLabel(s.label) });
			}
			return barView(present, missing);
		}
		const row = card.rows.find((r) => r.op === op) ?? card.rows[0];
		for (const s of card.series) {
			const value = row[s.key];
			if (typeof value === 'number') present.push({
				key: s.key,
				label: shortLabel(s.label),
				value,
				color: s.color,
			});
			else missing.push({ key: s.key, label: shortLabel(s.label) });
		}
		return barView(present, missing);
	});
	const valueFormat = overall ? fmtX : format;

	<figure class="bench-card">
		<figcaption class="bench-card-head">
			<span class="bench-card-title">
				{card.title as string}
			</span>
			<span class="bench-card-desc">
				{card.description as string}
			</span>
		</figcaption>
		@if (compare) {
			<div class="bench-ops" role="group" aria-label="Operation">
				<button
					type="button"
					class={['bench-op', { 'bench-op-on': overall }]}
					aria-pressed={overall}
					onClick={() => setOp(OVERALL_OP)}
				>
					{OVERALL_OP as string}
				</button>
				@for (const r of card.rows; key r.op) {
					<button
						type="button"
						class={['bench-op', { 'bench-op-on': r.op === op }]}
						aria-pressed={r.op === op}
						onClick={() => setOp(r.op as string)}
					>
						{r.op as string}
					</button>
				}
			</div>
		}
		<div class="bench-plot" aria-hidden="true">
			@for (const item of bars.present; key item.key) {
				<div class="bench-row">
					<span class="bench-row-label" title={item.label}>
						{item.label as string}
					</span>
					<div class="bench-track">
						<div
							class="bench-fill"
							style={'width:' + (item.value / bars.scaleMax) * 100 + '%;background:' + item.color}
						></div>
						<span
							class={[
								'bench-val',
								item.value / bars.scaleMax > 0.62 ? 'bench-val-in' : 'bench-val-out',
							]}
							style={'left:' + (item.value / bars.scaleMax) * 100 + '%'}
						>
							{valueFormat(item.value) as string}
						</span>
					</div>
				</div>
			}
			@for (const item of bars.missing; key item.key) {
				<div class="bench-row bench-row-empty">
					<span class="bench-row-label" title={item.label}>
						{item.label as string}
					</span>
					<div class="bench-track">
						<span class="bench-val bench-val-out bench-muted" style="left:0">{'—'}</span>
					</div>
				</div>
			}
		</div>
		@if (overall) {
			<p class="bench-plot-note">
				{'geometric mean across all operations, × vs ' + shortLabel(card.series[0].label) +
					' — lower is better'}
			</p>
		}
		<details class="bench-table">
			<summary>
				{tableCaption as string}
			</summary>
			<table>
				<thead>
					<tr>
						<th scope="col">operation</th>
						@for (const s of card.series; key s.key) {
							<th scope="col">
								{s.label as string}
							</th>
						}
					</tr>
				</thead>
				<tbody>
					@for (const row of card.rows; key row.op) {
						<tr>
							<th scope="row">
								{row.op as string}
							</th>
							@for (const s of card.series; key s.key) {
								<td>{format(row[s.key])}</td>
							}
						</tr>
					}
				</tbody>
			</table>
		</details>
		<style>
			.bench-card {
				margin: 0;
				background: var(--panel);
				border: 1px solid var(--border);
				border-radius: 12px;
				padding: 1.25rem 1.25rem 0.75rem;
				display: flex;
				flex-direction: column;
				gap: 0.75rem;
				min-width: 0;
				font-variant-numeric: tabular-nums;
			}
			.bench-card-head {
				display: flex;
				flex-direction: column;
				gap: 0.3rem;
			}
			.bench-card-title {
				font-weight: 600;
				color: var(--text);
				font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
				font-size: 0.95rem;
			}
			.bench-card-desc {
				color: var(--text-secondary);
				font-size: 0.85rem;
				line-height: 1.45;
			}
			.bench-ops {
				display: flex;
				flex-wrap: wrap;
				gap: 0.35rem;
			}
			.bench-op {
				padding: 0.25rem 0.6rem;
				border: 1px solid transparent;
				border-radius: 0.5rem;
				background: transparent;
				color: var(--text-secondary);
				font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
				font-size: 0.78rem;
				cursor: pointer;
				transition:
					background 0.15s,
					color 0.15s;
			}
			.bench-op:hover {
				color: var(--text);
				background: var(--surface-subtle);
			}
			.bench-op:focus-visible {
				outline: 2px solid #ff8296;
				outline-offset: 2px;
			}
			.bench-op-on {
				background: rgba(255, 65, 90, 0.16);
				color: var(--text);
			}
			/* The plot is one grid: the label column sizes to its longest label (so
			   the chart hugs the card's left edge instead of a fixed gutter) and the
			   rows share it through subgrid, keeping every bar's start aligned. */
			.bench-plot {
				display: grid;
				grid-template-columns: max-content 1fr;
				gap: 0.45rem 0.6rem;
				padding: 0.25rem 0;
			}
			.bench-row {
				grid-column: 1 / -1;
				display: grid;
				grid-template-columns: subgrid;
				align-items: center;
			}
			.bench-row-label {
				font-size: 0.82rem;
				color: var(--text);
				text-align: right;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}
			.bench-track {
				position: relative;
				height: 1.4rem;
				border-radius: 0 0.35rem 0.35rem 0;
				background: var(--surface-subtle);
			}
			.bench-fill {
				position: absolute;
				left: 0;
				top: 0;
				height: 100%;
				min-width: 2px;
				border-radius: 0 0.35rem 0.35rem 0;
				transition:
					width 0.3s ease,
					background 0.3s ease;
			}
			/* The value rides the bar tip (left set inline to the bar's fraction), so
			   it tracks the fill on any width. Long bars carry it inside
			   (right-aligned in the fill); short bars sit it just past the tip. */
			.bench-val {
				position: absolute;
				top: 50%;
				transform: translateY(-50%);
				font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
				font-size: 0.75rem;
				color: var(--text);
				white-space: nowrap;
				transition: left 0.3s ease;
			}
			.bench-val-out {
				padding-left: 0.4rem;
			}
			.bench-val-in {
				transform: translate(-100%, -50%);
				padding-right: 0.45rem;
				color: #fff;
				text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
			}
			.bench-row:hover .bench-fill {
				filter: brightness(1.12);
			}
			.bench-row-empty .bench-row-label,
			.bench-muted {
				color: var(--text-secondary);
			}
			.bench-plot-note {
				color: var(--text-secondary);
				font-size: 0.72rem;
				margin: 0;
			}
			.bench-table {
				border-top: 1px solid var(--border);
				padding-top: 0.5rem;
				overflow-x: auto;
			}
			.bench-table summary {
				color: var(--text-secondary);
				font-size: 0.8rem;
				cursor: pointer;
			}
			.bench-table summary:hover {
				color: var(--text);
			}
			.bench-table table {
				width: 100%;
				min-width: max-content;
				border-collapse: collapse;
				margin: 0.6rem 0 0.4rem;
				font-size: 0.8rem;
			}
			.bench-table th,
			.bench-table td {
				text-align: right;
				padding: 0.25rem 0.5rem;
				color: var(--text);
				border-bottom: 1px solid var(--border);
				white-space: nowrap;
			}
			.bench-table thead th {
				color: var(--text-secondary);
				font-weight: 500;
			}
			.bench-table thead th:first-child {
				text-align: left;
			}
			.bench-table th[scope='row'] {
				text-align: left;
				color: var(--text-secondary);
				font-weight: 400;
			}
			@media (max-width: 640px) {
				.bench-row-label,
				.bench-val {
					font-size: 0.72rem;
				}
			}
			@media (prefers-reduced-motion: reduce) {
				.bench-fill,
				.bench-val,
				.bench-op {
					transition: none;
				}
			}
		</style>
	</figure>
}
