/**
 * buildSnapshot contract over a synthetic bridge: the detail budget is spent
 * top-down (the reader-orienting root/top components carry state), the
 * truncation note appears only when something was actually skipped, and
 * performance rows honor the panel's self-exclusion prefixes.
 */
import { describe, expect, it } from 'vitest';
import type { DevtoolsTreeNode, OctaneDevtools } from 'octane/devtools';
import { buildSnapshot } from '@octanejs/devtools';

function chainOfComponents(depth: number): DevtoolsTreeNode {
	let node: DevtoolsTreeNode | null = null;
	for (let index = depth; index >= 1; index--) {
		node = {
			id: index,
			type: index === 1 ? 'root' : 'component',
			label: `C${index}`,
			lite: false,
			key: null,
			source: null,
			hookCount: 0,
			pending: false,
			inactive: false,
			children: node === null ? [] : [node],
		};
	}
	return node!;
}

function fakeHook(
	tree: DevtoolsTreeNode[],
	performanceRows: Array<{ file: string }>,
): OctaneDevtools {
	return {
		version: 1,
		isAttached: () => true,
		subscribe: () => () => {},
		getTree: () => tree,
		inspect: (id) => ({
			id,
			type: 'component',
			label: `C${id}`,
			source: null,
			props: { id },
			hooks: [],
			debugValues: [],
			domNodeCount: 1,
		}),
		getDomNodes: () => [],
		findByDomNode: () => null,
		getComponentSource: () => null,
		getEvents: () => [],
		clearEvents: () => {},
		setRecording: () => {},
		isRecording: () => true,
		setEffectTelemetry: () => {},
		isEffectTelemetryEnabled: () => false,
		markContainerInternal: () => {},
		getProfiler: () =>
			({
				start() {},
				stop() {},
				clear() {},
				getEvents: () => [],
				why: () => [],
				exportTrace: () => ({ displayTimeUnit: 'ms' as const, traceEvents: [] }),
				summary: () =>
					performanceRows.map((row) => ({
						componentId: row.file + '#X@1:0',
						component: 'X',
						file: row.file,
						attempts: 1,
						completed: 1,
						suspended: 0,
						errored: 0,
						bails: 0,
						totalTime: 1,
						totalSelfTime: 1,
						averageSelfTime: 1,
						maxInclusiveTime: 1,
						averageQueueDelay: 0,
						dominantCause: null,
					})),
			}) as ReturnType<OctaneDevtools['getProfiler']>,
	};
}

describe('buildSnapshot', () => {
	it('spends the detail budget top-down and notes only real truncation', () => {
		const hook = fakeHook([chainOfComponents(5)], []);
		const snapshot = buildSnapshot(hook, { maxDetailedNodes: 2 });

		// The root and its first descendant are detailed; deeper nodes are structural.
		const level1 = snapshot.tree[0];
		const level2 = level1.children[0];
		const level3 = level2.children[0];
		expect(level1.props).toBeDefined();
		expect(level2.props).toBeDefined();
		expect(level3.props).toBeUndefined();
		expect(snapshot.notes.join(' ')).toContain('first 2');

		// An exactly-fitting budget produces no truncation note.
		const exact = buildSnapshot(fakeHook([chainOfComponents(2)], []), { maxDetailedNodes: 2 });
		expect(exact.notes).toEqual([]);
	});

	it('filters performance rows by exclusion prefixes', () => {
		const hook = fakeHook(
			[chainOfComponents(1)],
			[
				{ file: '/src/App.tsrx' },
				{ file: '/@package/%40octanejs%2Fdevtools/src/panel/panel.tsrx' },
			],
		);
		const snapshot = buildSnapshot(hook, {
			excludeFilePrefixes: ['/@package/%40octanejs%2Fdevtools'],
		});
		expect(snapshot.performance).not.toBeNull();
		expect(snapshot.performance!.map((row) => row.file)).toEqual(['/src/App.tsrx']);
	});
});
