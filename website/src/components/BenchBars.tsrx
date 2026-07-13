// A benchmark card: legend chips, an @octanejs/recharts horizontal-bar chart
// (benchmark score ms per operation, lower is better), and a <details> table with the
// exact numbers — the accessibility/relief channel for the color encoding.
// Bars are static (isAnimationActive={false}); series colors come validated
// from content/benchmarks.ts and text always wears the site's text tokens.
//
// The chart is CLIENT-MOUNTED behind a hydration gate: the recharts store
// populates through layout effects, which the single-pass SSR never runs
// (chart SSR is a later @octanejs/recharts phase). The server renders a
// same-height shell — so hydration adopts identical DOM, no layout shift —
// and the SSR/no-JS content is the card's data table, which carries every
// number the chart draws.
import { useEffect, useState } from 'octane';
import { BarChart, Bar, XAxis, YAxis } from '@octanejs/recharts';
import type { BenchCard } from '../content/benchmarks.ts';

const BAR_SIZE = 11;
const GROUP_PAD = 16;
const AXIS_TEXT = { fill: '#99a1b3', fontSize: 12 };

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

export function BenchBars(props: { card: BenchCard; showValues?: boolean; width?: number }) @{
	const { card } = props;
	const chartWidth = props.width ?? 560;
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
	// Value labels at bar tips only where they stay readable (≤2 series);
	// denser cards lean on the number axis + the table view instead.
	const showValues = props.showValues ?? card.series.length <= 2;

	// Keep dense seven/eight-series comparisons legible without making each
	// operation group disproportionately tall.
	const barSize =
		card.series.length > 6 ? 9 : BAR_SIZE;
	const groupHeight = card.series.length * (barSize + 2) + GROUP_PAD;
	const chartHeight = card.rows.length * groupHeight + 24;
	const longestOp = Math.max(...card.rows.map((row) => String(row.op).length));
	const categoryWidth = Math.min(170, Math.max(90, longestOp * 6.6 + 12));
	const valueLabel = showValues
		? { position: 'right', fill: '#99a1b3', fontSize: 11, formatter: format }
		: false;

	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	<figure class="bench-card">
		<figcaption class="bench-card-head">
			<span class="bench-card-title">
				{card.title as string}
			</span>
			<span class="bench-card-desc">
				{card.description as string}
			</span>
		</figcaption>
		<div class="bench-key-row" aria-hidden="true">
			@for (const s of card.series; key s.key) {
				<span class="bench-key">
					<span class="bench-swatch" style={'background:' + s.color}></span>
					{s.label as string}
				</span>
			}
		</div>
		<div class="bench-plot">
			@if (mounted) {
				<BarChart
					width={chartWidth}
					height={chartHeight}
					data={card.rows}
					layout="vertical"
					barSize={barSize}
					barGap={2}
					margin={{ top: 4, right: showValues ? 48 : 16, bottom: 4, left: 0 }}
				>
					<XAxis
						type="number"
						hide={showValues}
						tick={AXIS_TEXT}
						axisLine={false}
						tickLine={false}
						tickFormatter={format}
					/>
					<YAxis
						type="category"
						dataKey="op"
						width={categoryWidth}
						tick={AXIS_TEXT}
						axisLine={false}
						tickLine={false}
					/>
					@for (const s of card.series; key s.key) {
						<Bar
							dataKey={s.key}
							fill={s.color}
							isAnimationActive={false}
							radius={[0, 4, 4, 0]}
							minPointSize={2}
							label={valueLabel}
						/>
					}
				</BarChart>
			} @else {
				<div
					class="bench-plot-shell"
					style={'height:' + chartHeight + 'px'}
					aria-hidden="true"
				></div>
			}
		</div>
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
				background: #2b3138;
				border: 1px solid rgba(255, 255, 255, 0.08);
				border-radius: 12px;
				padding: 1.25rem 1.25rem 0.75rem;
				display: flex;
				flex-direction: column;
				gap: 0.75rem;
				min-width: 0;
			}
			.bench-card-head {
				display: flex;
				flex-direction: column;
				gap: 0.3rem;
			}
			.bench-card-title {
				font-weight: 600;
				color: #f6f7f9;
				font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
				font-size: 0.95rem;
			}
			.bench-card-desc {
				color: #99a1b3;
				font-size: 0.85rem;
				line-height: 1.45;
			}
			.bench-key-row {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4rem 1rem;
			}
			.bench-key {
				display: inline-flex;
				align-items: center;
				gap: 0.4rem;
				color: #99a1b3;
				font-size: 0.8rem;
			}
			.bench-swatch {
				width: 10px;
				height: 10px;
				border-radius: 3px;
				display: inline-block;
			}
			.bench-plot {
				overflow-x: auto;
			}
			.bench-plot-shell {
				border-radius: 8px;
				background: linear-gradient(90deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0.05));
			}
			.bench-plot svg {
				display: block;
				max-width: none;
			}
			.bench-table {
				border-top: 1px solid rgba(255, 255, 255, 0.08);
				padding-top: 0.5rem;
				overflow-x: auto;
			}
			.bench-table summary {
				color: #99a1b3;
				font-size: 0.8rem;
				cursor: pointer;
			}
			.bench-table summary:hover {
				color: #f6f7f9;
			}
			.bench-table table {
				width: 100%;
				min-width: max-content;
				border-collapse: collapse;
				margin: 0.6rem 0 0.4rem;
				font-size: 0.8rem;
				font-variant-numeric: tabular-nums;
			}
			.bench-table th,
			.bench-table td {
				text-align: right;
				padding: 0.25rem 0.5rem;
				color: #f6f7f9;
				border-bottom: 1px solid rgba(255, 255, 255, 0.06);
				white-space: nowrap;
			}
			.bench-table thead th {
				color: #99a1b3;
				font-weight: 500;
			}
			.bench-table th[scope='row'] {
				text-align: left;
				color: #99a1b3;
				font-weight: 400;
			}
		</style>
	</figure>
}
