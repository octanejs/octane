// Two linked views over a normalized benchmark matrix (a BenchCard whose rows
// are suites and whose series are frameworks, values = ×-vs-Octane geometric
// mean across operations — Octane is 1× everywhere, lower is better):
//
//   1. a grouped horizontal bar chart for one suite at a time, over a
//      user-chosen subset of frameworks, drawn as plain divs so the reference
//      line, tint and tooltip are fully ours (no charting library); and
//   2. a heatmap of the whole grid, toggleable between "vs Octane" (raw) and
//      "vs fastest" (each row re-baselined to its fastest framework).
//
// Both views are deterministic from the checked-in matrix, so the server and
// client render the same controls, chart, and accessible data table. Hydration
// can therefore adopt the complete explorer without changing page geometry.
// The cursor-following tooltip is positioned imperatively through a ref, so a
// mousemove never re-renders the 100-cell grid.
import { useMemo, useRef, useState } from 'octane';
import type { BenchCard } from '../content/benchmarks.ts';

// ×-vs-Octane ratios: 12.3 → "12×", 2.64 → "2.6×", 1 → "1×", 0.9 → "0.90×".
function fmtX(v: number | null | undefined): string {
	if (v == null || !Number.isFinite(v)) return '—';
	if (v >= 10) return Math.round(v) + '×';
	if (v >= 1) return (v === Math.round(v) ? String(v) : v.toFixed(1)) + '×';
	return v.toFixed(2) + '×';
}

function geomean(values: number[]): number {
	if (values.length === 0) return 0;
	let sum = 0;
	for (const v of values) sum += Math.log(v);
	return Math.exp(sum / values.length);
}

// The single diverging→sequential scale. 1× is neutral (transparent, so the
// panel shows through as gray); below 1× tends green (faster/better), above
// tends red (slower/worse), saturating at a 4× gap in either direction. As a
// translucent wash over the surface the number on top always stays legible and
// the direction reads the same in light and dark.
function tintFor(v: number): string {
	const t = Math.max(-1, Math.min(1, Math.log(v) / Math.log(4)));
	const a = (Math.abs(t) * 0.5).toFixed(3);
	return t < 0 ? 'rgba(27, 175, 122, ' + a + ')' : 'rgba(240, 90, 80, ' + a + ')';
}

interface Tip {
	fw: string;
	suite: string;
	primary: string;
	secondary: string;
	fastest: string;
}

interface BarItem {
	key: string;
	label: string;
	value: number;
	color: string;
}

export function BenchmarkExplorer(props: { card: BenchCard }) @{
	const { card } = props;
	// Octane is the baseline column — it leads FRAMEWORKS and is 1× in every row.
	const baselineKey = card.series[0].key;
	const labelOf = useMemo(() => {
		const map: Record<string, string> = {};
		for (const s of card.series) map[s.key] = s.label;
		return map;
	});

	const [selected, setSelected] = useState(() => new Set(card.series.map((s) => s.key)));
	const [suite, setSuite] = useState(card.rows[0].op as string);
	const [mode, setMode] = useState('A' as 'A' | 'B');
	const [hovered, setHovered] = useState(null as Tip | null);

	const toggleFramework = (key: string) => {
		const next = new Set(selected);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		setSelected(next);
	};

	// --- Bar chart: the selected suite, over the selected frameworks. Always a
	// vs-Octane view (the reference line is Octane at 1×), sorted fastest-first,
	// nulls dropped to the bottom as muted "—" rows. -----------------------------
	const bars = useMemo(() => {
		const row = card.rows.find((r) => r.op === suite) ?? card.rows[0];
		const present: BarItem[] = [];
		const missing: Array<{ key: string; label: string }> = [];
		for (const s of card.series) {
			if (!selected.has(s.key)) continue;
			const value = row[s.key];
			if (typeof value === 'number') present.push({
				key: s.key,
				label: s.label,
				value,
				color: s.color,
			});
			else missing.push({ key: s.key, label: s.label });
		}
		present.sort((a, b) => a.value - b.value);
		const scaleMax = Math.max(1, ...present.map((i) => i.value)) * 1.1;
		return { present, missing, refFraction: 1 / scaleMax, scaleMax };
		// Explicit deps: `selected` is read only via `.has()` inside the loop, which
		// the compiler's inference misses, so a toggle would otherwise leave the bars
		// stale. An explicit array is honored verbatim (never rewritten).
	}, [card, suite, selected]);

	// --- Heatmap: raw grid + per-row re-baselining, computed once. --------------
	const grid = useMemo(
		() => card.rows.map((row) => {
			const nums: number[] = [];
			for (const s of card.series) {
				const v = row[s.key];
				if (typeof v === 'number') nums.push(v);
			}
			const fastest =
				nums.length ? Math.min(...nums) : null;
			const cells = card.series.map((s) => {
				const raw =
					typeof row[s.key] === 'number' ? row[s.key] as number : null;
				return {
					key: s.key,
					raw,
					rebased: raw != null && fastest ? raw / fastest : null,
					isFastest: raw != null && fastest != null && raw === fastest,
				};
			});
			const fastestCell = cells.find((c) => c.isFastest);
			return {
				op: row.op as string,
				cells,
				fastestLabel: fastestCell ? labelOf[fastestCell.key] : '',
			};
		}),
	);

	// Geometric means per framework (skip nulls), in both normalizations.
	const geo = useMemo(() => {
		const a: Record<string, number | null> = {};
		const b: Record<string, number | null> = {};
		for (const s of card.series) {
			const raws: number[] = [];
			const rebs: number[] = [];
			for (const r of grid) {
				const c = r.cells.find((c) => c.key === s.key)!;
				if (c.raw != null) raws.push(c.raw);
				if (c.rebased != null) rebs.push(c.rebased);
			}
			a[s.key] = raws.length ? geomean(raws) : null;
			b[s.key] = rebs.length ? geomean(rebs) : null;
		}
		return { a, b };
	});

	// The display projection for the current mode — text, tint and tooltip
	// strings per cell, so the template only reads flat properties.
	const heat = useMemo(() => {
		const rows = grid.map(
			(r) => ({
				op: r.op,
				cells: r.cells.map((c) => {
					const disp =
						mode === 'A' ? c.raw : c.rebased;
					const isRef = mode === 'A' && c.key === baselineKey;
					const kind =
						c.raw == null
							? 'null'
							: isRef
								? 'ref'
								: 'data';
					return {
						key: c.key,
						label: labelOf[c.key],
						kind,
						isFastest: mode === 'B' && c.isFastest,
						text: disp == null ? '—' : fmtX(disp),
						tint: kind === 'data' && disp != null ? tintFor(disp) : '',
						primary: mode === 'A' ? fmtX(c.raw) + ' vs Octane' : fmtX(c.rebased) + ' vs fastest',
						secondary: mode === 'B' && c.raw != null ? fmtX(c.raw) + ' vs Octane' : '',
						fastest: mode === 'B' ? r.fastestLabel : '',
						suite: r.op,
					};
				}),
			}),
		);
		const geoRow = card.series.map((s) => {
			const val =
				mode === 'A' ? geo.a[s.key] : geo.b[s.key];
			const isRef = mode === 'A' && s.key === baselineKey;
			return {
				key: s.key,
				text: val == null ? '—' : fmtX(val),
				tint: val != null && !isRef ? tintFor(val) : '',
				isRef,
			};
		});
		return { rows, geoRow };
	});

	// --- Tooltip: content lives in state (changes only on enter), position is
	// written straight to the node so a mousemove never re-renders the grid. ----
	const tipEl = useRef(null as HTMLDivElement | null);
	const ptr = useRef({ x: 0, y: 0 });

	const place = (el: HTMLDivElement, x: number, y: number) => {
		if (typeof window === 'undefined') return;
		const pad = 14;
		const w = el.offsetWidth;
		const h = el.offsetHeight;
		let left = x + pad;
		let top = y + pad;
		if (left + w > window.innerWidth - 8) left = x - w - pad;
		if (top + h > window.innerHeight - 8) top = y - h - pad;
		el.style.left = Math.max(8, left) + 'px';
		el.style.top = Math.max(8, top) + 'px';
	};
	const mountTip = (el: HTMLDivElement | null) => {
		tipEl.current = el;
		if (el) place(el, ptr.current.x, ptr.current.y);
	};
	const onMove = (e: MouseEvent) => {
		ptr.current = { x: e.clientX, y: e.clientY };
		if (tipEl.current) place(tipEl.current, e.clientX, e.clientY);
	};
	const show = (e: MouseEvent, tip: Tip) => {
		ptr.current = { x: e.clientX, y: e.clientY };
		setHovered(tip);
	};
	const hide = () => setHovered(null);

	<div class="bx" onMouseMove={onMove}>
		<>
			<div class="bx-panel">
				<div class="bx-controls">
					<div class="bx-ctl">
						<span class="bx-ctl-label" id="bx-fw-label">frameworks</span>
						<div class="bx-chips" role="group" aria-labelledby="bx-fw-label">
							@for (const s of card.series; key s.key) {
								<button
									type="button"
									class={['bx-chip', { 'bx-chip-on': selected.has(s.key) }]}
									aria-pressed={selected.has(s.key)}
									onClick={() => toggleFramework(s.key)}
								>
									<span class="bx-swatch" style={'background:' + s.color}></span>
									{s.label as string}
								</button>
							}
						</div>
					</div>
					<div class="bx-ctl">
						<span class="bx-ctl-label" id="bx-suite-label">suite</span>
						<div class="bx-suites" role="group" aria-labelledby="bx-suite-label">
							@for (const r of card.rows; key r.op) {
								<button
									type="button"
									class={['bx-suite', { 'bx-suite-on': r.op === suite }]}
									aria-pressed={r.op === suite}
									onClick={() => setSuite(r.op as string)}
								>
									{r.op as string}
								</button>
							}
						</div>
					</div>
				</div>

				<div
					class="bx-plot"
					role="img"
					aria-label={'Bar chart for the ' + suite + ' suite, × vs Octane, lower is better'}
				>
					<div
						class="bx-refline"
						style={'left:calc(var(--bx-label) + (100% - var(--bx-label)) * ' + bars.refFraction +
							')'}
					>
						<span class="bx-refcap">1× Octane</span>
					</div>
					@for (const item of bars.present; key item.key) {
						<div
							class="bx-row"
							onMouseEnter={(e: MouseEvent) => show(e, {
								fw: item.label,
								suite,
								primary: fmtX(item.value) + ' vs Octane',
								secondary: item.value < 0.98
									? 'faster than Octane'
									: item.value > 1.02
										? 'slower than Octane'
										: 'matches Octane',
								fastest: '',
							})}
							onMouseLeave={hide}
						>
							<span class="bx-row-label">
								{item.label as string}
							</span>
							<div class="bx-track">
								<div
									class="bx-fill"
									style={'width:' + (item.value / bars.scaleMax) * 100 + '%;background:' +
										item.color}
								></div>
								<span
									class={['bx-val', item.value / bars.scaleMax > 0.62 ? 'bx-val-in' : 'bx-val-out']}
									style={'left:' + (item.value / bars.scaleMax) * 100 + '%'}
								>
									{fmtX(item.value) as string}
								</span>
							</div>
						</div>
					}
					@for (const item of bars.missing; key item.key) {
						<div class="bx-row bx-row-empty">
							<span class="bx-row-label">
								{item.label as string}
							</span>
							<div class="bx-track">
								<span class="bx-val bx-val-out bx-muted" style="left:0">{'—'}</span>
							</div>
						</div>
					}
					@if (bars.present.length === 0 && bars.missing.length === 0) {
						<p class="bx-empty">Select at least one framework to compare.</p>
					}
				</div>
			</div>

			<div class="bx-panel">
				<div class="bx-heat-head">
					<span class="bx-ctl-label">all suites</span>
					<div class="bx-seg" role="group" aria-label="Heatmap normalization">
						<button
							type="button"
							class={['bx-seg-btn', { 'bx-seg-on': mode === 'A' }]}
							aria-pressed={mode === 'A'}
							onClick={() => setMode('A')}
						>
							vs Octane
						</button>
						<button
							type="button"
							class={['bx-seg-btn', { 'bx-seg-on': mode === 'B' }]}
							aria-pressed={mode === 'B'}
							onClick={() => setMode('B')}
						>
							vs fastest
						</button>
					</div>
				</div>

				<div class="bx-heat-scroll">
					<table class="bx-heat">
						<thead>
							<tr>
								<th scope="col" class="bx-corner">suite</th>
								@for (const s of card.series; key s.key) {
									<th scope="col">
										<span class="bx-th">
											<span class="bx-swatch" style={'background:' + s.color}></span>
											{s.label as string}
										</span>
									</th>
								}
							</tr>
						</thead>
						<tbody>
							@for (const r of heat.rows; key r.op) {
								<tr>
									<th scope="row" class="bx-rowhead">
										{r.op as string}
									</th>
									@for (const cell of r.cells; key cell.key) {
										<td
											class={[
												'bx-cell',
												{
													'bx-cell-null': cell.kind === 'null',
													'bx-cell-ref': cell.kind === 'ref',
													'bx-cell-fastest': cell.isFastest,
												},
											]}
											style={cell.kind === 'data' ? 'background:' + cell.tint : undefined}
											aria-label={cell.kind === 'null' ? 'no data' : undefined}
											onMouseEnter={(e: MouseEvent) => {
												if (cell.kind === 'data') show(e, {
													fw: cell.label,
													suite: cell.suite,
													primary: cell.primary,
													secondary: cell.secondary,
													fastest: cell.fastest,
												});
											}}
											onMouseLeave={() => {
												if (cell.kind === 'data') hide();
											}}
										>
											{cell.text as string}
										</td>
									}
								</tr>
							}
						</tbody>
						<tfoot>
							<tr>
								<th scope="row" class="bx-rowhead bx-geo-head">geomean</th>
								@for (const g of heat.geoRow; key g.key) {
									<td
										class={['bx-cell', 'bx-geo', { 'bx-cell-ref': g.isRef }]}
										style={g.tint ? 'background:' + g.tint : ''}
									>
										{g.text as string}
									</td>
								}
							</tr>
						</tfoot>
					</table>
				</div>
				<p class="bx-caption">
					{mode === 'A'
						? 'Each cell is that framework’s score relative to Octane (1×), geometric mean across the suite’s operations. Green is faster, red is slower.'
						: 'Each row is re-baselined so its fastest framework is 1×; every other cell is a multiple of that fastest time. The outlined cell wins the row.'}
				</p>
				<div class="bx-legend">
					<span class="bx-legend-item">
						<span class="bx-legend-label">Faster</span>
						<span class="bx-legend-scale" aria-hidden="true"></span>
						<span class="bx-legend-label">Slower</span>
					</span>
					<span class="bx-legend-item">
						<span class="bx-legend-swatch" aria-hidden="true"></span>
						Octane = 1× baseline
					</span>
				</div>
			</div>

			@if (hovered) {
				<div class="bx-tip" role="tooltip" ref={mountTip}>
					<div class="bx-tip-head">
						<span class="bx-tip-fw">
							{hovered.fw as string}
						</span>
						<span class="bx-tip-suite">
							{hovered.suite as string}
						</span>
					</div>
					<div class="bx-tip-primary">
						{hovered.primary as string}
					</div>
					@if (hovered.secondary) {
						<div class="bx-tip-sec">
							{hovered.secondary as string}
						</div>
					}
					@if (hovered.fastest) {
						<div class="bx-tip-fast">
							{'fastest: ' + hovered.fastest}
						</div>
					}
				</div>
			}
		</>

		<style>
			.bx {
				--bx-label: 8.5rem;
				display: flex;
				flex-direction: column;
				gap: 1rem;
				font-variant-numeric: tabular-nums;
			}
			.bx-panel {
				background: var(--panel);
				border: 1px solid var(--border);
				border-radius: 1rem;
				padding: 1.25rem;
			}

			.bx-ctl-label {
				display: block;
				font-size: 0.7rem;
				font-weight: 700;
				letter-spacing: 0.08em;
				text-transform: uppercase;
				color: var(--text-secondary);
				margin-bottom: 0.5rem;
			}

			/* Controls */
			.bx-controls {
				display: flex;
				flex-direction: column;
				gap: 1rem;
				margin-bottom: 1.25rem;
			}
			.bx-chips {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4rem;
			}
			.bx-chip {
				display: inline-flex;
				align-items: center;
				gap: 0.4rem;
				padding: 0.3rem 0.7rem;
				border: 1px solid var(--border);
				border-radius: 9999px;
				background: transparent;
				color: var(--text-secondary);
				font: inherit;
				font-size: 0.8rem;
				cursor: pointer;
				transition:
					background 0.15s,
					border-color 0.15s,
					color 0.15s,
					opacity 0.15s;
			}
			.bx-chip:hover {
				border-color: var(--text-secondary);
				color: var(--text);
			}
			.bx-chip-on {
				background: var(--surface);
				border-color: var(--border);
				color: var(--text);
			}
			.bx-chip:not(.bx-chip-on) {
				opacity: 0.6;
			}
			.bx-chip:not(.bx-chip-on) .bx-swatch {
				filter: grayscale(1);
			}
			.bx-chip:focus-visible,
			.bx-suite:focus-visible,
			.bx-seg-btn:focus-visible {
				outline: 2px solid var(--accent-hover);
				outline-offset: 2px;
			}
			.bx-swatch {
				width: 10px;
				height: 10px;
				border-radius: 3px;
				flex: none;
			}
			.bx-suites {
				display: flex;
				flex-wrap: wrap;
				gap: 0.35rem;
			}
			.bx-suite {
				padding: 0.25rem 0.6rem;
				border: 1px solid transparent;
				border-radius: 0.5rem;
				background: transparent;
				color: var(--text-secondary);
				font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
				font-size: 0.78rem;
				cursor: pointer;
				transition:
					background 0.15s,
					color 0.15s;
			}
			.bx-suite:hover {
				color: var(--text);
				background: var(--surface-subtle);
			}
			.bx-suite-on {
				background: rgba(255, 65, 90, 0.16);
				color: var(--text);
			}

			/* Bar chart */
			.bx-plot {
				position: relative;
				display: flex;
				flex-direction: column;
				gap: 0.45rem;
				padding-top: 0.5rem;
			}
			.bx-refline {
				position: absolute;
				top: 0;
				bottom: 0.2rem;
				width: 0;
				border-left: 1px dashed var(--border);
				pointer-events: none;
				z-index: 1;
			}
			.bx-refcap {
				position: absolute;
				top: -0.65rem;
				left: 0.3rem;
				font-size: 0.62rem;
				letter-spacing: 0.04em;
				text-transform: uppercase;
				color: var(--text-secondary);
				white-space: nowrap;
			}
			.bx-row {
				display: grid;
				grid-template-columns: var(--bx-label) 1fr;
				align-items: center;
				gap: 0.5rem;
			}
			.bx-row-label {
				font-size: 0.82rem;
				color: var(--text);
				text-align: right;
				white-space: nowrap;
				overflow: hidden;
				text-overflow: ellipsis;
			}
			.bx-track {
				position: relative;
				height: 1.5rem;
			}
			.bx-fill {
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
			/* The value rides the bar tip (left set inline to the bar's fraction), so it
			   tracks the fill on any width. Long bars carry it inside (right-aligned in
			   the fill); short bars sit it just past the tip — never overflowing. */
			.bx-val {
				position: absolute;
				top: 50%;
				transform: translateY(-50%);
				font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
				font-size: 0.78rem;
				color: var(--text);
				white-space: nowrap;
				transition: left 0.3s ease;
			}
			.bx-val-out {
				padding-left: 0.4rem;
			}
			.bx-val-in {
				transform: translate(-100%, -50%);
				padding-right: 0.45rem;
				color: #fff;
				text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
			}
			.bx-row:hover .bx-fill {
				filter: brightness(1.12);
			}
			.bx-row-empty .bx-row-label {
				color: var(--text-secondary);
			}
			.bx-muted {
				color: var(--text-secondary);
			}
			.bx-empty {
				color: var(--text-secondary);
				font-size: 0.85rem;
				margin: 0.5rem 0;
			}

			/* Heatmap */
			.bx-heat-head {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
				flex-wrap: wrap;
				margin-bottom: 1rem;
			}
			.bx-heat-head .bx-ctl-label {
				margin-bottom: 0;
			}
			.bx-seg {
				display: inline-flex;
				border: 1px solid var(--border);
				border-radius: 0.6rem;
				padding: 0.15rem;
				gap: 0.15rem;
			}
			.bx-seg-btn {
				padding: 0.3rem 0.75rem;
				border: 0;
				border-radius: 0.45rem;
				background: transparent;
				color: var(--text-secondary);
				font: inherit;
				font-size: 0.8rem;
				cursor: pointer;
				transition:
					background 0.15s,
					color 0.15s;
			}
			.bx-seg-btn:hover {
				color: var(--text);
			}
			.bx-seg-on {
				background: var(--surface);
				color: var(--text);
			}
			.bx-heat-scroll {
				overflow-x: auto;
			}
			.bx-heat {
				border-collapse: separate;
				border-spacing: 3px;
				width: 100%;
				min-width: max-content;
			}
			.bx-heat th {
				font-weight: 500;
				color: var(--text-secondary);
			}
			.bx-th {
				display: inline-flex;
				align-items: center;
				gap: 0.35rem;
				font-size: 0.72rem;
				white-space: nowrap;
				padding: 0 0.2rem 0.3rem;
			}
			.bx-corner {
				text-align: left;
			}
			.bx-rowhead {
				position: sticky;
				left: 0;
				z-index: 2;
				text-align: left;
				padding-right: 0.75rem;
				background: var(--panel);
				font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
				font-size: 0.76rem;
				color: var(--text);
				white-space: nowrap;
			}
			.bx-geo-head {
				font-weight: 700;
			}
			.bx-cell {
				min-width: 3.5rem;
				padding: 0.4rem 0.5rem;
				text-align: center;
				border-radius: 0.4rem;
				font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
				font-size: 0.78rem;
				color: var(--text);
				background: var(--surface-subtle);
				transition: background 0.3s ease;
			}
			.bx-cell-null {
				color: var(--text-secondary);
				background: repeating-linear-gradient(
					-45deg,
					transparent,
					transparent 4px,
					var(--surface-subtle) 4px,
					var(--surface-subtle) 5px
				);
			}
			.bx-cell-ref {
				border: 1px dashed var(--border);
				background: transparent;
				color: var(--text-secondary);
			}
			.bx-cell-fastest {
				outline: 2px solid var(--accent);
				outline-offset: -2px;
				font-weight: 700;
			}
			.bx-cell:not(.bx-cell-null):not(.bx-cell-ref):hover {
				filter: brightness(1.15);
			}
			.bx-geo {
				border-top: 2px solid var(--border);
				font-weight: 700;
			}
			.bx-caption {
				color: var(--text-secondary);
				font-size: 0.8rem;
				line-height: 1.5;
				margin: 1rem 0 0;
			}

			/* Legend — the color key for the heatmap scale. */
			.bx-legend {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.75rem 1.5rem;
				margin-top: 0.85rem;
				color: var(--text-secondary);
				font-size: 0.75rem;
			}
			.bx-legend-item {
				display: inline-flex;
				align-items: center;
				gap: 0.5rem;
			}
			.bx-legend-label {
				font-weight: 600;
				color: var(--text);
			}
			.bx-legend-scale {
				width: 7rem;
				height: 0.55rem;
				border-radius: 9999px;
				background: linear-gradient(90deg, #1baf7a, #6b7280, #f05a50);
			}
			.bx-legend-swatch {
				width: 1.6rem;
				height: 0.9rem;
				border-radius: 0.25rem;
				border: 1px dashed var(--border);
			}

			/* Tooltip */
			.bx-tip {
				position: fixed;
				top: 0;
				left: 0;
				z-index: 50;
				pointer-events: none;
				min-width: 9rem;
				max-width: 16rem;
				padding: 0.5rem 0.65rem;
				border-radius: 0.55rem;
				background: #14171c;
				border: 1px solid var(--border);
				box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
				animation: bx-fade 0.12s ease;
			}
			.bx-tip-head {
				display: flex;
				align-items: baseline;
				justify-content: space-between;
				gap: 0.75rem;
				margin-bottom: 0.25rem;
			}
			.bx-tip-fw {
				font-size: 0.8rem;
				font-weight: 700;
				color: var(--text);
			}
			.bx-tip-suite {
				font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
				font-size: 0.68rem;
				color: var(--text-secondary);
			}
			.bx-tip-primary {
				font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
				font-size: 0.9rem;
				font-weight: 600;
				color: var(--text);
			}
			.bx-tip-sec,
			.bx-tip-fast {
				font-size: 0.72rem;
				color: var(--text-secondary);
				margin-top: 0.15rem;
			}
			@keyframes bx-fade {
				from {
					opacity: 0;
				}
				to {
					opacity: 1;
				}
			}

			/* Mobile: tighten the panel, shrink the bar-label gutter and type so the
			   bars keep as much width as possible; the heatmap already scrolls. */
			@media (max-width: 640px) {
				.bx {
					--bx-label: 5.5rem;
				}
				.bx-panel {
					padding: 1rem 0.85rem;
					border-radius: 0.85rem;
				}
				.bx-controls {
					gap: 0.85rem;
					margin-bottom: 1rem;
				}
				.bx-row-label {
					font-size: 0.72rem;
				}
				.bx-val {
					font-size: 0.72rem;
				}
				.bx-refcap {
					font-size: 0.56rem;
				}
			}
			@media (max-width: 400px) {
				.bx {
					--bx-label: 4.5rem;
				}
				.bx-chip {
					padding: 0.28rem 0.55rem;
					font-size: 0.75rem;
				}
			}
			@media (prefers-reduced-motion: reduce) {
				.bx-fill,
				.bx-cell,
				.bx-chip,
				.bx-suite,
				.bx-seg-btn {
					transition: none;
				}
				.bx-tip {
					animation: none;
				}
			}
		</style>
	</div>
}
