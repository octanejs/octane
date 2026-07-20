import * as React from 'react';
import * as Plot from '@observablehq/plot';
import { PlotContainer } from '~/components/charts/PlotContainer';
import type { SkillHistoryEntry } from '~/utils/intent.functions';

export function SkillSparklinePlaceholder({ height = 40 }: { height?: number }) {
	return (
		<div
			className="animate-pulse rounded bg-gray-100 dark:bg-gray-800/40"
			style={{ width: '100%', height }}
		/>
	);
}

interface SkillSparklineProps {
	history: Array<SkillHistoryEntry>;
	height?: number;
	maxSlots?: number;
	onVersionClick?: (entry: SkillHistoryEntry, index: number) => void;
}

export function SkillSparkline({
	history,
	height = 40,
	maxSlots,
	onVersionClick,
}: SkillSparklineProps) {
	const n = history.length;
	const slots = Math.max(maxSlots ?? n, n);
	const offset = slots - n;

	const options = React.useCallback(
		(width: number) => {
			const pxPerSlot = width / slots;
			const barPx = Math.min(10, pxPerSlot * 0.6);
			const barW = (barPx / 2) * (slots / width);

			const rectData: Array<{
				x1: number;
				x2: number;
				y1: number;
				y2: number;
				type: string;
			}> = [];

			for (let i = 0; i < n; i++) {
				const entry = history[i];
				const x = i + offset;
				const hasChanges = entry.added > 0 || entry.modified > 0 || entry.removed > 0;

				if (hasChanges) {
					let y0 = 0;
					if (entry.added > 0) {
						rectData.push({
							x1: x - barW,
							x2: x + barW,
							y1: y0,
							y2: y0 + entry.added,
							type: 'added',
						});
						y0 += entry.added;
					}
					if (entry.modified > 0) {
						rectData.push({
							x1: x - barW,
							x2: x + barW,
							y1: y0,
							y2: y0 + entry.modified,
							type: 'modified',
						});
						y0 += entry.modified;
					}
					if (entry.removed > 0) {
						rectData.push({
							x1: x - barW,
							x2: x + barW,
							y1: y0,
							y2: y0 + entry.removed,
							type: 'removed',
						});
					}
				} else {
					// No changes — gray bar showing total
					rectData.push({
						x1: x - barW,
						x2: x + barW,
						y1: 0,
						y2: entry.total,
						type: 'unchanged',
					});
				}
			}

			const yMax = Math.max(...history.map((h) => h.total), 1);

			const tipData = history.map((d, i) => {
				const status =
					d.added > 0
						? 'added'
						: d.modified > 0
							? 'modified'
							: d.removed > 0
								? 'removed'
								: 'unchanged';
				return { ...d, _x: i + offset, _status: status };
			});

			return {
				height,
				marginLeft: 0,
				marginRight: 0,
				marginTop: 2,
				marginBottom: 2,
				x: { axis: null, domain: [-0.5, slots - 0.5] },
				y: { axis: null, domain: [0, yMax] },
				marks: [
					Plot.rect(rectData, {
						x1: 'x1',
						x2: 'x2',
						y1: 'y1',
						y2: 'y2',
						fill: 'type',
					}),
					Plot.tip(
						tipData,
						Plot.pointer({
							x: '_x',
							y: 'total',
							fill: '_status',
							channels: {
								Version: (d) => `v${d.version}`,
								Skills: (d) => d.total,
								Added: (d) => (d.added > 0 ? `+${d.added}` : null),
								Removed: (d) => (d.removed > 0 ? `-${d.removed}` : null),
								Modified: (d) => (d.modified > 0 ? `~${d.modified}` : null),
							},
							format: {
								x: false,
								y: false,
								fill: true,
							},
						} as Plot.TipOptions),
					),
				],
				color: {
					domain: ['added', 'removed', 'modified', 'unchanged'],
					range: ['#22c55e', '#ef4444', '#f59e0b', '#808080'],
				},
				style: { background: 'transparent' },
			} satisfies Partial<Parameters<typeof Plot.plot>[0]>;
		},
		[history, height, slots, offset, n],
	);

	const handleClick = React.useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!onVersionClick) return;
			const container = e.currentTarget;
			const rect = container.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const width = container.clientWidth;
			if (width === 0) return;

			const domainX = (x / width) * slots - 0.5;
			const slotIndex = Math.round(domainX);
			const historyIndex = slotIndex - offset;
			if (historyIndex < 0 || historyIndex >= n) return;

			e.preventDefault();
			e.stopPropagation();
			onVersionClick(history[historyIndex], historyIndex);
		},
		[onVersionClick, slots, offset, n, history],
	);

	if (history.length === 0) {
		return null;
	}

	return (
		<PlotContainer
			options={options}
			height={height}
			onClick={onVersionClick ? handleClick : undefined}
			style={onVersionClick ? { cursor: 'pointer' } : undefined}
		/>
	);
}
