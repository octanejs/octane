/// <reference path="./react-fixture.d.ts" />

import { createRoot as createOctaneRoot } from '../../../src/index.js';
import { createRoot as createReactRoot } from 'react-dom/client';
import { createElement } from 'react';
import * as OctaneFixture from '../../_fixtures/continuous-actions.tsrx';
import * as ReactFixture from 'virtual:continuous-actions-react-fixture';
import type { ActionProbeOptions } from '../../_fixtures/continuous-actions.tsrx';

type RuntimeName = 'octane' | 'react';
type ProbeState = { moves: number; saved: string; pending: string };
type HandlerRecord = ProbeState & { label: string; trusted: boolean };
const runtimes: RuntimeName[] = ['octane', 'react'];
const containers = {
	octane: document.querySelector<HTMLElement>('#octane-root')!,
	react: document.querySelector<HTMLElement>('#react-root')!,
};
const logs: Record<RuntimeName, HandlerRecord[]> = { octane: [], react: [] };
const releases: Array<() => void> = [];

function state(runtime: RuntimeName): ProbeState {
	const container = containers[runtime];
	return {
		moves: Number(container.querySelector('[data-moves]')?.textContent ?? '0'),
		saved: container.querySelector('[data-saved]')?.textContent ?? '',
		pending: container.querySelector('[data-pending]')?.textContent ?? '',
	};
}

function mount(options: ActionProbeOptions): void {
	for (const runtime of runtimes) {
		const props = {
			...options,
			gate: new Promise<void>((resolve) => releases.push(resolve)),
			record(label: string, event: Event) {
				const native = (event as Event & { nativeEvent?: Event }).nativeEvent ?? event;
				logs[runtime].push({ ...state(runtime), label, trusted: native.isTrusted });
			},
		};
		const name = options.postAwait ? 'PostAwaitActionProbe' : 'ContinuousActionProbe';
		if (runtime === 'octane') {
			createOctaneRoot(containers[runtime]).render(OctaneFixture[name], props);
		} else {
			createReactRoot(containers[runtime]).render(createElement(ReactFixture[name], props));
		}
	}
}

window.__continuousActions = {
	mount,
	logs,
	state,
	release: () => releases.forEach((resolve) => resolve()),
};

declare global {
	interface Window {
		__continuousActions: {
			mount(options: ActionProbeOptions): void;
			logs: Record<RuntimeName, HandlerRecord[]>;
			state(runtime: RuntimeName): ProbeState;
			release(): void;
		};
	}
}
