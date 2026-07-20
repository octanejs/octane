/**
 * Agent prompt generation: turn a devtools snapshot (plus a selection) into a
 * self-contained markdown prompt a coding agent can act on directly — exact
 * source positions, live state, render causes and timings, and the Octane
 * conventions an agent needs so it doesn't "fix" intentional divergences from
 * React. Pure functions over inert data, so every output is unit-testable.
 */

import type { DevtoolsSourceLocation } from 'octane/devtools';
import { describeEvent, findNodePath, formatMs, formatSource } from './format.js';
import { formatValuePreview } from './serialize.js';
import type { DevtoolsSnapshot, SnapshotNode, SnapshotPerformanceRow } from './snapshot.js';

export type AgentPromptKind = 'investigate' | 'performance' | 'state';

export interface AgentPromptOptions {
	/** Shapes the task framing and which evidence sections lead. */
	kind?: AgentPromptKind;
	/** The selected tree node the prompt centers on. */
	nodeId?: number;
	/** The developer's own description of the problem, quoted verbatim. */
	issue?: string;
	/** Cap for the recent-events section. */
	eventLimit?: number;
}

/** Markdown form of a source position, with prompt-friendly null wording. */
function mdSource(source: DevtoolsSourceLocation | null): string {
	return source === null ? '(source unknown)' : `\`${formatSource(source)}\``;
}

function hookLines(node: SnapshotNode): string[] {
	if (node.hooks === undefined || node.hooks.length === 0) return [];
	return node.hooks.map((hook) => {
		const parts = [`${hook.order + 1}. \`${hook.name}\``];
		if (hook.source !== null) parts.push(`at ${mdSource(hook.source)}`);
		if (hook.value !== undefined && hook.value.t !== 'undefined')
			parts.push(`— value: \`${formatValuePreview(hook.value)}\``);
		if (hook.deps !== undefined) parts.push(`deps: \`${formatValuePreview(hook.deps)}\``);
		if (hook.hasCleanup === true) parts.push('(cleanup registered)');
		return parts.join(' ');
	});
}

function performanceTable(rows: SnapshotPerformanceRow[]): string[] {
	const lines = [
		'| Component | Renders | Bails | Self time (total) | Self time (avg) | Max inclusive | Queue delay (avg) | Dominant cause |',
		'| --- | --- | --- | --- | --- | --- | --- | --- |',
	];
	for (const row of rows) {
		lines.push(
			`| ${row.component} | ${row.attempts} | ${row.bails} | ${formatMs(row.totalSelfTime)} | ${formatMs(row.averageSelfTime)} | ${formatMs(row.maxInclusiveTime)} | ${formatMs(row.averageQueueDelay)} | ${row.dominantCause ?? '—'} |`,
		);
	}
	return lines;
}

const OCTANE_NOTES = [
	'This app uses Octane (octanejs.dev): the React hooks API compiled ahead of time; components are authored in `.tsrx` (JSX plus `@if`/`@for`/`@switch`/`@try` template directives and an `@{ … }` implicit-return body).',
	'Hooks are keyed by compiler-assigned call-site slots, not call order — a hook behind a condition or after an early return is valid Octane. Do not "fix" it to satisfy React\'s rules of hooks.',
	'Omitted dependency arrays on `useEffect`/`useMemo`/`useCallback`/… are compiler-inferred from the closure. An explicit array keeps exact React semantics; `null` means run after every render.',
	'Events are native and delegated. Text inputs use `onInput` for per-keystroke updates; `onChange` keeps its native commit-on-blur meaning — do not add a synthetic `onChange`.',
	'`useState`/`useReducer` support an optional third tuple member `getState` for reading the latest value from long-lived closures.',
	'Source positions in this prompt point into the authored source files (line:column, pre-compilation).',
];

/**
 * Build a ready-to-paste markdown prompt for a coding agent from a snapshot
 * and (optionally) a selected component.
 */
export function buildAgentPrompt(snapshot: DevtoolsSnapshot, options?: AgentPromptOptions): string {
	const kind = options?.kind ?? 'investigate';
	const path = options?.nodeId !== undefined ? findNodePath(snapshot.tree, options.nodeId) : null;
	const node = path !== null ? path[path.length - 1] : null;
	const lines: string[] = [];

	const subject = node !== null ? `\`${node.label}\`` : 'this Octane application';
	if (kind === 'performance') {
		lines.push(`# Investigate and fix a rendering performance problem in ${subject}`);
	} else if (kind === 'state') {
		lines.push(`# Investigate unexpected state/props behavior in ${subject}`);
	} else {
		lines.push(`# Investigate an issue in ${subject}`);
	}
	lines.push('');
	if (options?.issue !== undefined && options.issue.trim() !== '') {
		lines.push('Reported by the developer:', '');
		for (const issueLine of options.issue.trim().split('\n')) lines.push(`> ${issueLine}`);
		lines.push('');
	}
	lines.push(
		'The evidence below was captured live from the running app by Octane DevTools.',
		'',
		'## Capture context',
		'',
		`- Captured at: ${snapshot.capturedAt}`,
		`- Page: ${snapshot.url ?? '(unknown)'}`,
		`- Live component nodes: ${snapshot.componentCount}`,
	);

	if (node !== null && path !== null) {
		lines.push('', '## Selected component', '');
		lines.push(`- **${node.label}** — ${mdSource(node.source)}`);
		if (path.length > 1) {
			lines.push(`- Render path: ${path.map((entry) => entry.label).join(' → ')}`);
		}
		if (node.lite) lines.push('- Inlined (lite) component: re-renders with its parent.');
		if (node.pending) lines.push('- A re-render was queued at capture time.');
		if (node.inactive) lines.push('- Inside a hidden `<Activity>` subtree at capture time.');
		if (node.props !== undefined) {
			lines.push(`- Props: \`${formatValuePreview(node.props, 200)}\``);
		}
		if (node.domNodeCount !== undefined) lines.push(`- DOM nodes managed: ${node.domNodeCount}`);
		const hooks = hookLines(node);
		if (hooks.length > 0) {
			lines.push('', '### Hook state (first-render call order)', '');
			lines.push(...hooks);
		}
		if (node.debugValues !== undefined && node.debugValues.length > 0) {
			lines.push('', '### Custom hook debug values (`useDebugValue`)', '');
			for (const debug of node.debugValues) {
				const parts = [`- ${debug.owner !== null ? `\`${debug.owner}\`` : 'debug value'}`];
				if (debug.source !== null) parts.push(`at ${mdSource(debug.source)}`);
				parts.push(`— \`${formatValuePreview(debug.value)}\``);
				lines.push(parts.join(' '));
			}
		}
	}

	if (snapshot.performance !== null && snapshot.performance.length > 0) {
		const rows =
			node !== null
				? [
						...snapshot.performance.filter((row) => row.component === node.label),
						...snapshot.performance.filter((row) => row.component !== node.label).slice(0, 5),
					]
				: snapshot.performance.slice(0, 8);
		if (rows.length > 0) {
			lines.push('', '## Render performance (profiler)', '');
			lines.push(...performanceTable(rows));
			lines.push(
				'',
				'Timings are from an instrumented dev/profile build — treat them as relative evidence, not production numbers.',
			);
		}
	}

	const eventLimit = options?.eventLimit ?? 20;
	if (snapshot.events.length > 0 && eventLimit > 0) {
		const recent = snapshot.events.slice(-eventLimit);
		lines.push('', '## Recent runtime events', '');
		for (const event of recent) lines.push(`- ${describeEvent(event)}`);
	}

	lines.push('', '## What to do', '');
	if (node !== null && node.source !== null) {
		lines.push(`1. Open ${mdSource(node.source)} and read the component and its hooks.`);
	} else {
		lines.push('1. Locate the relevant components from the evidence above.');
	}
	if (kind === 'performance') {
		lines.push(
			'2. Use the render counts, self times, and dominant causes to find who re-renders too often or too expensively, and why (state cause source positions are listed above).',
			'3. Fix the root cause — typical fixes: move state closer to where it is used, memoize expensive children (`memo`), stabilize identities, or split a hot component.',
			'4. Re-run the app and confirm the render counts/self time drop for the affected components.',
		);
	} else if (kind === 'state') {
		lines.push(
			'2. Compare the captured hook values and props against what the UI should show, and trace where the divergence starts.',
			'3. Fix the root cause and verify the state transitions in the running app.',
		);
	} else {
		lines.push(
			'2. Reproduce the issue, using the captured state and events as the starting point.',
			'3. Fix the root cause and verify the behavior in the running app.',
		);
	}
	if (snapshot.notes.length > 0) {
		lines.push('', ...snapshot.notes.map((note) => `> Note: ${note}`));
	}
	lines.push('', '## Octane framework notes', '');
	for (const note of OCTANE_NOTES) lines.push(`- ${note}`);
	lines.push('');
	return lines.join('\n');
}
