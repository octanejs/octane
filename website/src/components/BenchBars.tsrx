// A benchmark card: legend chips, a deterministic @octanejs/visx horizontal
// bar chart (benchmark score ms per operation, lower is better), and a
// <details> table with the exact numbers — the accessibility/relief channel
// for the color encoding. The SVG renders identically on the server and client,
// so hydration adopts the real chart instead of replacing a chart shell.
import { AxisBottom } from '@octanejs/visx/axis';
import { Group } from '@octanejs/visx/group';
import { scaleLinear } from '@octanejs/visx/scale';
import { Bar } from '@octanejs/visx/shape';
import type { BenchCard, BenchRow, SeriesDef } from '../content/benchmarks.ts';

const BAR_SIZE = 11;
const GROUP_PAD = 16;
const BAR_GAP = 2;
const AXIS_TEXT = {
	fill: '#99a1b3',
	fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
	fontSize: 10,
	textAnchor: 'middle',
} as const;

interface ChartValue {
	series: SeriesDef;
	value: number;
	slot: number;
}

// Unsupported combinations (currently Svelte/Vue Vapor streaming SSR) omit
// their bars completely. Center the remaining values within the row's normal
// series-height allocation so gaps never appear between real measurements.
function chartValues(row: BenchRow, series: SeriesDef[]): ChartValue[] {
	const values = series.flatMap((entry) => {
		const value = row[entry.key];
		return typeof value === 'number'
			? [
					{ series: entry, value },
				]
			: [];
	});
	const start = Math.floor((series.length - values.length) / 2);
	return values.map((entry, index) => ({ ...entry, slot: start + index }));
}

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

// The card's one-line reading: each series' geometric mean across operations,
// relative to the card's first series (Octane .tsrx on framework cards, the
// tuned fixture on the de-opt cards), ranked fastest-first. Rows where either
// value is missing (unsupported combinations) drop out of that series' mean.
interface Verdict {
	series: SeriesDef;
	ratio: number;
}

function verdicts(card: BenchCard): Verdict[] {
	const reference = card.series[0];
	const entries: Verdict[] = [];
	for (const series of card.series) {
		const ratios: number[] = [];
		for (const row of card.rows) {
			const base = row[reference.key];
			const value = row[series.key];
			if (typeof base === 'number' && base > 0 && typeof value === 'number' && value > 0) {
				ratios.push(value / base);
			}
		}
		if (ratios.length > 0) {
			const mean = Math.exp(ratios.reduce((sum, r) => sum + Math.log(r), 0) / ratios.length);
			entries.push({ series, ratio: mean });
		}
	}
	return entries.sort((a, b) => a.ratio - b.ratio);
}

// Chip labels drop trailing version tokens ("React 19" → "React") — the full
// versioned label stays in the data table header.
function shortLabel(label: string): string {
	return label.replace(/\s+[\d][\d.]*.*$/, '');
}

// A ratio within half a percent of the reference is a tie — show it as the
// same "1×" as the reference chip instead of a misleadingly precise "1.00×".
function fmtChipX(ratio: number): string {
	return Math.abs(ratio - 1) < 0.005 ? '1×' : fmtX(ratio);
}

function indexedRows(card: BenchCard): Array<{ row: BenchRow; index: number }> {
	return card.rows.map((row, index) => ({ row, index }));
}

function barWidth(value: number, widthScale: (value: number) => number): number {
	return Math.max(2, widthScale(value));
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
	const groupHeight = card.series.length * (barSize + BAR_GAP) + GROUP_PAD;
	const chartHeight = card.rows.length * groupHeight + 24;
	const longestOp = Math.max(...card.rows.map((row) => String(row.op).length));
	const categoryWidth = Math.min(170, Math.max(90, longestOp * 6.6 + 12));
	const rightPadding = showValues ? 48 : 16;
	const plotWidth = chartWidth - categoryWidth - rightPadding;
	const widthScale = scaleLinear<number>({
		domain: [0, maxValue(card)],
		range: [0, plotWidth],
	});
	const rows = indexedRows(card);
	const barsHeight = card.series.length * (barSize + BAR_GAP);
	// Single-series cards keep the plain legend; everything else gets the ranked
	// geomean strip (which doubles as the legend — same swatches).
	const cardVerdicts =
		card.series.length > 1 ? verdicts(card) : [];
	const verdictNote = 'geomean vs ' + shortLabel(card.series[0].label) + ' · lower is better';

	<figure class="bench-card">
		<figcaption class="bench-card-head">
			<span class="bench-card-title">
				{card.title as string}
			</span>
			<span class="bench-card-desc">
				{card.description as string}
			</span>
		</figcaption>
		@if (cardVerdicts.length > 0) {
			<div class="bench-key-row">
				@for (const v of cardVerdicts; key v.series.key) {
					<span class="bench-key" title={v.series.label}>
						<span class="bench-swatch" style={'background:' + v.series.color}></span>
						{shortLabel(v.series.label)}
						<span class="bench-key-x">{fmtChipX(v.ratio)}</span>
					</span>
				}
				<span class="bench-key-note">
					{verdictNote as string}
				</span>
			</div>
		} @else {
			<div class="bench-key-row" aria-hidden="true">
				@for (const s of card.series; key s.key) {
					<span class="bench-key">
						<span class="bench-swatch" style={'background:' + s.color}></span>
						{s.label as string}
					</span>
				}
			</div>
		}
		<div class="bench-plot" aria-hidden="true">
			<svg
				class="bench-chart"
				width={chartWidth}
				height={chartHeight}
				viewBox={'0 0 ' + chartWidth + ' ' + chartHeight}
				focusable="false"
			>
				@for (const rowEntry of rows; key rowEntry.row.op) {
					<Group top={rowEntry.index * groupHeight + 4}>
						<text
							class="op-label"
							x={categoryWidth - 12}
							y={Math.floor(barsHeight / 2) + 4}
							text-anchor="end"
						>
							{rowEntry.row.op as string}
						</text>
						@for (const entry of chartValues(rowEntry.row, card.series); key entry.series.key) {
							<>
								<Bar
									className="bench-bar"
									data-series={entry.series.key}
									x={categoryWidth}
									y={entry.slot * (barSize + BAR_GAP)}
									width={barWidth(entry.value, widthScale)}
									height={barSize}
									rx="4"
									fill={entry.series.color}
								/>
								@if (showValues) {
									<text
										class="value-label"
										x={categoryWidth + barWidth(entry.value, widthScale) + 6}
										y={entry.slot * (barSize + BAR_GAP) + barSize - 1}
									>{format(entry.value)}</text>
								}
							</>
						}
					</Group>
				}
				@if (!showValues) {
					<AxisBottom
						axisClassName="bench-value-axis"
						top={chartHeight - 20}
						left={categoryWidth}
						scale={widthScale}
						numTicks={4}
						hideAxisLine={true}
						tickLength={3}
						tickStroke="rgba(255, 255, 255, 0.18)"
						tickLabelProps={AXIS_TEXT}
						tickFormat={format}
					/>
				}
			</svg>
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
				align-items: center;
				gap: 0.4rem 1rem;
			}
			.bench-key {
				display: inline-flex;
				align-items: center;
				gap: 0.4rem;
				color: #99a1b3;
				font-size: 0.8rem;
			}
			.bench-key-x {
				color: #f6f7f9;
				font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
				font-size: 0.75rem;
				font-variant-numeric: tabular-nums;
			}
			.bench-key-note {
				margin-left: auto;
				color: #6e7787;
				font-size: 0.72rem;
				white-space: nowrap;
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
			.bench-plot svg {
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
