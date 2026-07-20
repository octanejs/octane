import { describe, expect, it } from 'vitest';
import {
	buildAgentPrompt,
	serializeValue,
	type DevtoolsSnapshot,
	type SnapshotNode,
} from '@octanejs/devtools';

function node(overrides: Partial<SnapshotNode> & { id: number; label: string }): SnapshotNode {
	return {
		type: 'component',
		lite: false,
		key: null,
		source: null,
		hookCount: 0,
		pending: false,
		inactive: false,
		children: [],
		...overrides,
	};
}

function snapshot(): DevtoolsSnapshot {
	return {
		source: 'octane-devtools',
		capturedAt: '2026-07-19T10:00:00.000Z',
		url: 'http://localhost:5173/todos',
		componentCount: 3,
		tree: [
			node({
				id: 1,
				label: 'App',
				type: 'root',
				source: { file: 'src/App.tsrx', line: 4, column: 7 },
				children: [
					node({
						id: 2,
						label: 'TodoList',
						source: { file: 'src/TodoList.tsrx', line: 9, column: 0 },
						hookCount: 2,
						props: serializeValue({ filter: 'open' }),
						hooks: [
							{
								order: 0,
								kind: 'useState',
								name: 'useState',
								source: { file: 'src/TodoList.tsrx', line: 10, column: 8 },
								value: serializeValue(['write docs']),
							},
							{
								order: 1,
								kind: 'useEffect',
								name: 'useEffect',
								source: { file: 'src/TodoList.tsrx', line: 14, column: 1 },
								value: serializeValue(undefined),
								hasCleanup: true,
							},
						],
						debugValues: [
							{
								order: 0,
								owner: 'useTodos',
								source: { file: 'src/useTodos.ts', line: 6, column: 1 },
								value: serializeValue('1 open todo'),
							},
						],
						domNodeCount: 3,
					}),
				],
			}),
		],
		performance: [
			{
				component: 'TodoList',
				file: 'src/TodoList.tsrx',
				attempts: 41,
				completed: 41,
				suspended: 0,
				errored: 0,
				bails: 2,
				totalTime: 220,
				totalSelfTime: 180,
				averageSelfTime: 4.4,
				maxInclusiveTime: 31,
				averageQueueDelay: 1.2,
				dominantCause: 'state',
			},
		],
		events: [
			{ kind: 'commit', at: 1000 },
			{
				kind: 'effect',
				at: 1001,
				phase: 'passive',
				duration: 2.5,
				component: 'TodoList',
				componentSource: { file: 'src/TodoList.tsrx', line: 9, column: 0 },
				hook: 'useEffect',
				hookSource: { file: 'src/TodoList.tsrx', line: 14, column: 1 },
			},
		],
		notes: [],
	};
}

describe('buildAgentPrompt', () => {
	it('centers the prompt on the selected component with exact source positions', () => {
		const prompt = buildAgentPrompt(snapshot(), { nodeId: 2, issue: 'List flickers on toggle.' });
		expect(prompt).toContain('# Investigate an issue in `TodoList`');
		expect(prompt).toContain('> List flickers on toggle.');
		expect(prompt).toContain('`src/TodoList.tsrx:9:0`');
		expect(prompt).toContain('Render path: App → TodoList');
		expect(prompt).toContain('`useState`');
		expect(prompt).toContain('`src/TodoList.tsrx:10:8`');
		expect(prompt).toContain('(cleanup registered)');
		expect(prompt).toContain('Props: `{filter: "open"}`');
		expect(prompt).toContain('Open `src/TodoList.tsrx:9:0`');
		expect(prompt).toContain('useDebugValue');
		expect(prompt).toContain('`useTodos` at `src/useTodos.ts:6:1` — `"1 open todo"`');
	});

	it('leads with profiler evidence for performance prompts', () => {
		const prompt = buildAgentPrompt(snapshot(), { kind: 'performance', nodeId: 2 });
		expect(prompt).toContain('# Investigate and fix a rendering performance problem in `TodoList`');
		expect(prompt).toContain('| TodoList | 41 | 2 |');
		expect(prompt).toContain('dominant cause');
		expect(prompt.toLowerCase()).toContain('memo');
	});

	it('always carries the Octane framework notes so agents respect divergences', () => {
		const prompt = buildAgentPrompt(snapshot());
		expect(prompt).toContain('## Octane framework notes');
		expect(prompt).toContain('rules of hooks');
		expect(prompt).toContain('onInput');
		expect(prompt).toContain('compiler-inferred');
	});

	it('includes recent runtime events with hook sources', () => {
		const prompt = buildAgentPrompt(snapshot(), { nodeId: 2 });
		expect(prompt).toContain('## Recent runtime events');
		expect(prompt).toContain('passive effect TodoList');
		expect(prompt).toContain('src/TodoList.tsrx:14');
	});
});
