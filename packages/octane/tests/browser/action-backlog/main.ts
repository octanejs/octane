/// <reference path="./react-fixture.d.ts" />

import { createRoot as createOctaneRoot } from '../../../src/index.js';
import { createRoot as createReactRoot } from 'react-dom/client';
import { createElement } from 'react';
import { ActionBacklog as OctaneActionBacklog } from '../../_fixtures/action-backlog.tsrx';
import { ActionBacklog as ReactActionBacklog } from 'virtual:action-backlog-react-fixture';

type RuntimeName = 'octane' | 'react';
type Commit = { state: number; pending: boolean };
type Probe = { commits: Commit[]; results: number[]; release(): void };

const containers = {
	octane: document.querySelector<HTMLElement>('#octane-root')!,
	react: document.querySelector<HTMLElement>('#react-root')!,
};
const probes: Partial<Record<RuntimeName, Probe>> = {};
// Event Timing reports an interaction's latency from input to the next paint.
// Entries arrive asynchronously, so they are collected for the whole page.
const latencies: Array<{ runtime: RuntimeName | null; name: string; duration: number }> = [];
new PerformanceObserver((list) => {
	for (const entry of list.getEntries() as PerformanceEventTiming[]) {
		const target = entry.target as Element | null;
		const runtime = target?.closest('#octane-root')
			? 'octane'
			: target?.closest('#react-root')
				? 'react'
				: null;
		latencies.push({ runtime, name: entry.name, duration: entry.duration });
	}
}).observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit);

window.__actionBacklog = {
	mount(runtime, busyMs) {
		let open!: () => void;
		const gate = new Promise<void>((resolve) => (open = resolve));
		const probe: Probe = { commits: [], results: [], release: () => open() };
		probes[runtime] = probe;
		const props = {
			gate,
			busyMs,
			release: () => open(),
			onCommit: (state: number, pending: boolean) => probe.commits.push({ state, pending }),
			onResult: (value: number) => probe.results.push(value),
		};
		if (runtime === 'octane')
			createOctaneRoot(containers.octane).render(OctaneActionBacklog, props);
		else createReactRoot(containers.react).render(createElement(ReactActionBacklog, props));
	},
	submit(runtime, count) {
		const form = containers[runtime].querySelector('form')!;
		for (let i = 0; i < count; i++) form.requestSubmit();
	},
	probe: (runtime) => {
		const probe = probes[runtime]!;
		return { commits: [...probe.commits], results: [...probe.results] };
	},
	pending: (runtime) => containers[runtime].querySelector('[data-pending]')!.textContent!,
	latency(runtime) {
		let max = 0;
		for (const entry of latencies)
			if (entry.runtime === runtime && entry.duration > max) max = entry.duration;
		return max;
	},
};

declare global {
	interface Window {
		__actionBacklog: {
			mount(runtime: RuntimeName, busyMs: number): void;
			submit(runtime: RuntimeName, count: number): void;
			probe(runtime: RuntimeName): { commits: Commit[]; results: number[] };
			pending(runtime: RuntimeName): string;
			latency(runtime: RuntimeName): number;
		};
	}
}
