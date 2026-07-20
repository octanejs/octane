/**
 * Shared display formatting for devtools evidence — one wording for source
 * positions, durations, bridge events, and tree-path lookup, used by both the
 * panel UI (panel/panel.tsrx) and the agent prompt builder (prompt.ts). Pure
 * functions over inert data.
 */

import type { DevtoolsEvent, DevtoolsSourceLocation } from 'octane/devtools';

/** `file:line:column` for a known source position; '' for null. */
export function formatSource(source: DevtoolsSourceLocation | null): string {
	return source === null ? '' : source.file + ':' + source.line + ':' + source.column;
}

/** The last two path segments of a file, for dense tables and rows. */
export function shortFile(file: string): string {
	return file.split('/').slice(-2).join('/');
}

/** Compact `dir/file:line` form of a source position; '' for null. */
export function shortSource(source: DevtoolsSourceLocation | null): string {
	if (source === null) return '';
	return shortFile(source.file) + ':' + source.line;
}

export function formatMs(value: number): string {
	return (value >= 10 ? value.toFixed(0) : value.toFixed(1)) + 'ms';
}

/** One-line human description of a bridge event. */
export function describeEvent(event: DevtoolsEvent): string {
	switch (event.kind) {
		case 'commit':
			return 'commit @ ' + formatMs(event.at);
		case 'effect':
			return (
				event.phase +
				' effect ' +
				(event.component ?? '(unknown component)') +
				(event.hook !== null ? ' · ' + event.hook : '') +
				(event.hookSource !== null
					? ' at ' + event.hookSource.file + ':' + event.hookSource.line
					: '') +
				' — ' +
				formatMs(event.duration)
			);
		case 'hmr':
			return 'HMR swapped ' + (event.component ?? 'a component') + ' @ ' + formatMs(event.at);
		case 'root-added':
			return 'root mounted @ ' + formatMs(event.at);
		case 'root-removed':
			return 'root unmounted @ ' + formatMs(event.at);
	}
}

/** Root-to-node path for a tree id, or null when the id is not in the tree. */
export function findNodePath<T extends { id: number; children: T[] }>(
	nodes: T[],
	id: number,
): T[] | null {
	for (const node of nodes) {
		if (node.id === id) return [node];
		const childPath = findNodePath(node.children, id);
		if (childPath !== null) return [node, ...childPath];
	}
	return null;
}
