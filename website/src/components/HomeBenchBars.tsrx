// The home-page benchmark overview uses deterministic Visx scales and SVG
// primitives. Unlike Recharts' effect-populated store, this exact chart renders
// during SSR and hydration adopts it without swapping renderers. The full
// /benchmarks route retains Recharts for its richer charts, and the exact data
// remains available in the native details/table immediately below the SVG.
import { Group } from '@octanejs/visx/group';
import { scaleLinear } from '@octanejs/visx/scale';
import { Bar } from '@octanejs/visx/shape';
import type { BenchCard, BenchRow, SeriesDef } from '../content/benchmarks.ts';

const CHART_WIDTH = 1100;
const LABEL_WIDTH = 170;
const PLOT_WIDTH = 820;
const BAR_HEIGHT = 11;
const BAR_GAP = 2;
const GROUP_GAP = 16;

function fmtX(value: unknown): string {
	const number =
		typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(number)) return '—';
	if (number >= 10) return Math.round(number) + '×';
	if (number >= 1) {
		return (number === Math.round(number) ? String(number) : number.toFixed(1)) + '×';
	}
	return number.toFixed(2) + '×';
}

function maxValue(card: BenchCard): number {
	let max = 1;
	for (const row of card.rows) {
		for (const series of card.series) {
			const value = row[series.key];
			if (typeof value === 'number') max = Math.max(max, value);
		}
	}
	return max;
}

function barWidth(value: number, widthScale: (value: number) => number): number {
	return Math.max(2, widthScale(value));
}

function indexedRows(card: BenchCard): Array<{ row: BenchRow; index: number }> {
	return card.rows.map((row, index) => ({ row, index }));
}

function indexedSeries(card: BenchCard): Array<{ series: SeriesDef; index: number }> {
	return card.series.map((series, index) => ({ series, index }));
}

export function HomeBenchBars(props: { card: BenchCard }) @{
	const { card } = props;
	const rows = indexedRows(card);
	const series = indexedSeries(card);
	const groupHeight = card.series.length * (BAR_HEIGHT + BAR_GAP) + GROUP_GAP;
	const chartHeight = card.rows.length * groupHeight + 24;
	const widthScale = scaleLinear<number>({
		domain: [0, maxValue(card)],
		range: [0, PLOT_WIDTH],
	});
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
			@for (const entry of series; key entry.series.key) {
				<span class="bench-key">
					<span class="bench-swatch" style={'background:' + entry.series.color}></span>
					{entry.series.label as string}
				</span>
			}
		</div>
		<div class="bench-plot" aria-hidden="true">
			<svg
				class="home-bench-chart"
				width={CHART_WIDTH}
				height={chartHeight}
				viewBox={'0 0 ' + CHART_WIDTH + ' ' + chartHeight}
				focusable="false"
			>
				@for (const rowEntry of rows; key rowEntry.row.op) {
					<Group top={rowEntry.index * groupHeight}>
						<text class="op-label" x={LABEL_WIDTH - 12} y={14} text-anchor="end">
							{rowEntry.row.op as string}
						</text>
						@for (const seriesEntry of series; key seriesEntry.series.key) {
							@if (typeof rowEntry.row[seriesEntry.series.key] === 'number') {
								<>
									<Bar
										x={LABEL_WIDTH}
										y={seriesEntry.index * (BAR_HEIGHT + BAR_GAP) + 3}
										width={barWidth(rowEntry.row[seriesEntry.series.key] as number, widthScale)}
										height={BAR_HEIGHT}
										rx="3"
										fill={seriesEntry.series.color}
									/>
									<text
										class="value-label"
										x={LABEL_WIDTH +
											barWidth(rowEntry.row[seriesEntry.series.key] as number, widthScale) +
											7}
										y={seriesEntry.index * (BAR_HEIGHT + BAR_GAP) + 11}
									>{fmtX(rowEntry.row[seriesEntry.series.key])}</text>
								</>
							}
						}
					</Group>
				}
			</svg>
		</div>
		<details class="bench-table">
			<summary>Data table (× vs Octane, geometric mean across operations)</summary>
			<table>
				<thead>
					<tr>
						<th scope="col">operation</th>
						@for (const entry of series; key entry.series.key) {
							<th scope="col">
								{entry.series.label as string}
							</th>
						}
					</tr>
				</thead>
				<tbody>
					@for (const rowEntry of rows; key rowEntry.row.op) {
						<tr>
							<th scope="row">
								{rowEntry.row.op as string}
							</th>
							@for (const seriesEntry of series; key seriesEntry.series.key) {
								<td>{fmtX(rowEntry.row[seriesEntry.series.key])}</td>
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
			.bench-plot,
			.bench-table {
				overflow-x: auto;
			}
			.home-bench-chart {
				display: block;
				max-width: none;
			}
			.op-label,
			.value-label {
				fill: #99a1b3;
				font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
				font-size: 11px;
			}
			.bench-table {
				border-top: 1px solid rgba(255, 255, 255, 0.08);
				padding-top: 0.5rem;
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
