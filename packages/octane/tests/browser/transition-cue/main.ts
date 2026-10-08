/// <reference path="./react-fixture.d.ts" />

import { createRoot as createOctaneRoot } from '../../../src/index.js';
import { createRoot as createReactRoot } from 'react-dom/client';
import { createElement } from 'react';
import {
	TransitionSort as OctaneTransitionSort,
	TransitionSortShell as OctaneTransitionSortShell,
} from '../../_fixtures/transition-sort.tsrx';
import {
	TransitionSort as ReactTransitionSort,
	TransitionSortShell as ReactTransitionSortShell,
} from 'virtual:transition-sort-react-fixture';

type RuntimeName = 'octane' | 'react';
// `component`: the cue and the transition's state in one component. `ancestor`:
// the cue in an ancestor of the component that holds that state.
type Variant = 'component' | 'ancestor';
type Commit = { label: string; sorted: boolean };

const containers = {
	octane: document.querySelector<HTMLElement>('#octane-root')!,
	react: document.querySelector<HTMLElement>('#react-root')!,
};
const commits: Record<RuntimeName, Commit[]> = { octane: [], react: [] };
// Event Timing reports an interaction's latency from input to the next paint.
// Entries arrive asynchronously, so they are collected for the whole page.
const latencies: Array<{ runtime: RuntimeName | null; duration: number }> = [];
new PerformanceObserver((list) => {
	for (const entry of list.getEntries() as PerformanceEventTiming[]) {
		const target = entry.target as Element | null;
		const runtime = target?.closest('#octane-root')
			? 'octane'
			: target?.closest('#react-root')
				? 'react'
				: null;
		latencies.push({ runtime, duration: entry.duration });
	}
}).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);

window.__transitionCue = {
	mount(runtime, busyMs, variant) {
		const props = {
			busyMs,
			onCommit: (label: string, sorted: boolean) => commits[runtime].push({ label, sorted }),
		};
		if (runtime === 'octane')
			createOctaneRoot(containers.octane).render(
				variant === 'ancestor' ? OctaneTransitionSortShell : OctaneTransitionSort,
				props,
			);
		else
			createReactRoot(containers.react).render(
				createElement(
					variant === 'ancestor' ? ReactTransitionSortShell : ReactTransitionSort,
					props,
				),
			);
	},
	commits: (runtime) => [...commits[runtime]],
	list: (runtime) => containers[runtime].querySelector('[data-list]')!.textContent!,
	latency(runtime) {
		let max = 0;
		for (const entry of latencies)
			if (entry.runtime === runtime && entry.duration > max) max = entry.duration;
		return max;
	},
};

declare global {
	interface Window {
		__transitionCue: {
			mount(runtime: RuntimeName, busyMs: number, variant: Variant): void;
			commits(runtime: RuntimeName): Commit[];
			list(runtime: RuntimeName): string;
			latency(runtime: RuntimeName): number;
		};
	}
}
