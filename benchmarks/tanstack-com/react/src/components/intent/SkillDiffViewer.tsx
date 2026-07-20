import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { diffLines } from 'diff';
import { intentSkillContentDiffQueryOptions } from '~/queries/intent';

export function SkillDiffViewer({
	packageName,
	skillName,
	fromVersion,
	toVersion,
}: {
	readonly packageName: string;
	readonly skillName: string;
	readonly fromVersion: string;
	readonly toVersion: string;
}) {
	const diffQuery = useQuery(
		intentSkillContentDiffQueryOptions({
			packageName,
			skillName,
			fromVersion,
			toVersion,
		}),
	);

	if (diffQuery.isLoading) {
		const SKELETON_WIDTHS = ['85%', '72%', '90%', '65%', '78%', '82%'];
		return (
			<div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
				<div className="animate-pulse p-4 space-y-2">
					{SKELETON_WIDTHS.map((w, i) => (
						<div
							key={i}
							className="h-4 rounded bg-gray-100 dark:bg-gray-800/60"
							style={{ width: w }}
						/>
					))}
				</div>
			</div>
		);
	}

	const data = diffQuery.data;
	if (!data || (data.fromContent === null && data.toContent === null)) {
		return (
			<p className="text-xs text-gray-400 dark:text-gray-500 italic">
				Content not available for diff.
			</p>
		);
	}

	const changes = diffLines(data.fromContent ?? '', data.toContent ?? '');

	// Build line-level entries from diff hunks
	const lines: Array<{
		type: 'context' | 'added' | 'removed';
		content: string;
		oldNum: number | null;
		newNum: number | null;
	}> = [];

	let oldLine = 1;
	let newLine = 1;

	for (const change of changes) {
		const lineTexts = change.value.split('\n');
		// diffLines includes a trailing empty string from the final newline
		if (lineTexts[lineTexts.length - 1] === '') lineTexts.pop();

		for (const text of lineTexts) {
			if (change.added) {
				lines.push({
					type: 'added',
					content: text,
					oldNum: null,
					newNum: newLine++,
				});
			} else if (change.removed) {
				lines.push({
					type: 'removed',
					content: text,
					oldNum: oldLine++,
					newNum: null,
				});
			} else {
				lines.push({
					type: 'context',
					content: text,
					oldNum: oldLine++,
					newNum: newLine++,
				});
			}
		}
	}

	// Collapse long runs of context lines (show first/last 3 of each run)
	const CONTEXT_WINDOW = 3;
	const collapsed = collapseContext(lines, CONTEXT_WINDOW);

	const addedCount = lines.filter((l) => l.type === 'added').length;
	const removedCount = lines.filter((l) => l.type === 'removed').length;

	return (
		<div className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden text-xs">
			{/* Header */}
			<div className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800">
				<span className="font-mono text-gray-500 dark:text-gray-400">
					v{fromVersion} → v{toVersion}
				</span>
				<div className="flex items-center gap-2 ml-auto tabular-nums">
					{addedCount > 0 && (
						<span className="text-emerald-600 dark:text-emerald-400">+{addedCount}</span>
					)}
					{removedCount > 0 && (
						<span className="text-red-500 dark:text-red-400">-{removedCount}</span>
					)}
				</div>
			</div>

			{/* Diff body */}
			<div className="overflow-x-auto">
				<table className="w-full font-mono text-[13px] leading-5 border-collapse">
					<tbody>
						{collapsed.map((entry, i) => {
							if (entry.kind === 'separator') {
								return (
									<tr key={`sep-${i}`}>
										<td
											colSpan={3}
											className="px-3 py-1.5 text-center text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/30 border-y border-gray-100 dark:border-gray-800/50 select-none"
										>
											⋯ {entry.hiddenCount} unchanged {entry.hiddenCount === 1 ? 'line' : 'lines'}
										</td>
									</tr>
								);
							}

							const line = entry.line;
							const bgClass =
								line.type === 'added'
									? 'bg-emerald-50/70 dark:bg-emerald-950/20'
									: line.type === 'removed'
										? 'bg-red-50/70 dark:bg-red-950/20'
										: '';
							const gutterClass =
								line.type === 'added'
									? 'text-emerald-500/60 dark:text-emerald-600/60 bg-emerald-50 dark:bg-emerald-950/30'
									: line.type === 'removed'
										? 'text-red-400/60 dark:text-red-600/60 bg-red-50 dark:bg-red-950/30'
										: 'text-gray-300 dark:text-gray-700 bg-gray-50/50 dark:bg-gray-900/20';
							const prefixChar = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
							const prefixColor =
								line.type === 'added'
									? 'text-emerald-600 dark:text-emerald-400'
									: line.type === 'removed'
										? 'text-red-500 dark:text-red-400'
										: 'text-transparent';

							return (
								<tr key={i} className={bgClass}>
									<td
										className={`w-[1px] whitespace-nowrap px-2 py-0 text-right select-none border-r border-gray-100 dark:border-gray-800/50 tabular-nums ${gutterClass}`}
									>
										{line.oldNum ?? ''}
									</td>
									<td
										className={`w-[1px] whitespace-nowrap px-2 py-0 text-right select-none border-r border-gray-100 dark:border-gray-800/50 tabular-nums ${gutterClass}`}
									>
										{line.newNum ?? ''}
									</td>
									<td className="px-3 py-0 whitespace-pre-wrap break-all">
										<span className={`select-none mr-1.5 ${prefixColor}`}>{prefixChar}</span>
										{line.content}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

type CollapsedEntry =
	| {
			kind: 'line';
			line: {
				type: 'context' | 'added' | 'removed';
				content: string;
				oldNum: number | null;
				newNum: number | null;
			};
	  }
	| { kind: 'separator'; hiddenCount: number };

function collapseContext(
	lines: Array<{
		type: 'context' | 'added' | 'removed';
		content: string;
		oldNum: number | null;
		newNum: number | null;
	}>,
	window: number,
): Array<CollapsedEntry> {
	// Find runs of consecutive context lines
	const result: Array<CollapsedEntry> = [];
	let contextStart: number | null = null;

	const flushContext = (end: number) => {
		if (contextStart === null) return;
		const runLength = end - contextStart;
		if (runLength <= window * 2 + 1) {
			// Short run — show all lines
			for (let j = contextStart; j < end; j++) {
				result.push({ kind: 'line', line: lines[j] });
			}
		} else {
			// Long run — show first `window`, separator, last `window`
			for (let j = contextStart; j < contextStart + window; j++) {
				result.push({ kind: 'line', line: lines[j] });
			}
			result.push({
				kind: 'separator',
				hiddenCount: runLength - window * 2,
			});
			for (let j = end - window; j < end; j++) {
				result.push({ kind: 'line', line: lines[j] });
			}
		}
		contextStart = null;
	};

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].type === 'context') {
			if (contextStart === null) contextStart = i;
		} else {
			flushContext(i);
			result.push({ kind: 'line', line: lines[i] });
		}
	}
	flushContext(lines.length);

	return result;
}
