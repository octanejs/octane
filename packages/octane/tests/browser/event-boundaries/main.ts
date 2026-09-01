/// <reference path="./react-fixture.d.ts" />

import { createRoot as createOctaneRoot } from '../../../src/index.js';
import { createRoot as createReactRoot } from 'react-dom/client';
import { flushSync as flushReactSync } from 'react-dom';
import { createElement } from 'react';
import * as OctaneFixture from '../../_fixtures/event-boundaries.tsrx';
import * as ReactFixture from 'virtual:event-boundaries-react-fixture';
import type { EventProbeProps } from '../../_fixtures/event-boundaries.tsrx';

export type RuntimeName = 'octane' | 'react';
export type SameRootScenario =
	| 'baseline'
	| 'framework-stop'
	| 'framework-native-immediate'
	| 'framework-stop-and-immediate'
	| 'root-bubble-stop'
	| 'root-bubble-immediate'
	| 'root-capture-stop'
	| 'root-capture-immediate'
	| 'target-stop'
	| 'target-immediate';
export type ProbeOptions =
	| { kind: 'same-root'; scenario: SameRootScenario }
	| { kind: 'nested'; stop: boolean }
	| { kind: 'shadow'; mode: ShadowRootMode }
	| { kind: 'slot' };
type HandlerRecord = {
	label: string;
	trusted: boolean;
	nativeStopped: boolean;
	target: string;
	currentTarget: string;
};
const containers = {
	octane: document.querySelector<HTMLElement>('#octane-root')!,
	react: document.querySelector<HTMLElement>('#react-root')!,
};
const logs: Record<RuntimeName, HandlerRecord[]> = { octane: [], react: [] };
const targets: Partial<Record<RuntimeName, HTMLElement>> = {};
let slot: HTMLSlotElement | undefined;

customElements.define('event-probe-host', class extends HTMLElement {});

function name(target: EventTarget | null): string {
	if (target === document) return 'document';
	if (target instanceof HTMLElement) return target.dataset.name ?? target.id;
	return '';
}

function record(runtime: RuntimeName, label: string, event: Event): void {
	const native = (event as Event & { nativeEvent?: Event }).nativeEvent ?? event;
	logs[runtime].push({
		label,
		trusted: native.isTrusted,
		nativeStopped: native.cancelBubble,
		target: name(event.target),
		currentTarget: name(event.currentTarget),
	});
}

function render(
	runtime: RuntimeName,
	component: 'SameRoot' | 'OuterNested' | 'Inner',
	container: HTMLElement,
	props: EventProbeProps,
): void {
	if (runtime === 'octane') {
		createOctaneRoot(container).render(OctaneFixture[component], props);
	} else {
		// Only mounting is synchronous; trusted input is never wrapped in flushSync.
		flushReactSync(() => {
			createReactRoot(container).render(createElement(ReactFixture[component], props));
		});
	}
}

function mountSameRoot(runtime: RuntimeName, scenario: SameRootScenario): void {
	const container = containers[runtime];
	const rootCapture = scenario.startsWith('root-capture');
	container.addEventListener(
		'click',
		(event) => {
			record(runtime, 'native:root:before', event);
			if (scenario.startsWith('root-')) {
				if (scenario.endsWith('immediate')) event.stopImmediatePropagation();
				else event.stopPropagation();
			}
		},
		rootCapture,
	);
	const props: EventProbeProps = {
		record(label, event) {
			record(runtime, label, event);
			if (label !== 'target:bubble') return;
			if (scenario === 'framework-stop' || scenario === 'framework-stop-and-immediate') {
				event.stopPropagation();
			}
			if (
				scenario === 'framework-native-immediate' ||
				scenario === 'framework-stop-and-immediate'
			) {
				const native = (event as Event & { nativeEvent?: Event }).nativeEvent ?? event;
				native.stopImmediatePropagation();
			}
		},
	};
	render(runtime, 'SameRoot', container, props);
	const target = container.querySelector<HTMLElement>('[data-target]')!;
	targets[runtime] = target;
	target.addEventListener('click', (event) => {
		record(runtime, 'native:target:first', event);
		if (scenario === 'target-stop') event.stopPropagation();
		if (scenario === 'target-immediate') event.stopImmediatePropagation();
	});
	target.addEventListener('click', (event) => record(runtime, 'native:target:second', event));
	container.addEventListener(
		'click',
		(event) => record(runtime, 'native:root:after', event),
		rootCapture,
	);
	document.addEventListener('click', (event) => {
		if (container.contains(event.target as Node)) record(runtime, 'native:document', event);
	});
}

function mountNested(runtime: RuntimeName, stop: boolean): void {
	const container = containers[runtime];
	const props: EventProbeProps = { record: (label, event) => record(runtime, label, event) };
	render(runtime, 'OuterNested', container, props);
	const middle = container.querySelector<HTMLElement>('[data-middle]')!;
	middle.addEventListener(
		'click',
		(event) => record(runtime, 'native:middle:capture', event),
		true,
	);
	middle.addEventListener('click', (event) => {
		record(runtime, 'native:middle:bubble', event);
		if (stop) event.stopPropagation();
	});
	render(runtime, 'Inner', container.querySelector<HTMLElement>('[data-inner-root]')!, props);
	targets[runtime] = container.querySelector<HTMLElement>('[data-target]')!;
}

function mountShadow(options: Extract<ProbeOptions, { kind: 'shadow' | 'slot' }>): void {
	const props: EventProbeProps = {
		record: (label, event) => record('octane', label, event),
	};
	const isSlot = options.kind === 'slot';
	createOctaneRoot(containers.octane).render(
		isSlot ? OctaneFixture.OuterSlot : OctaneFixture.OuterShadow,
		props,
	);
	const host = containers.octane.querySelector<HTMLElement>('[data-host]')!;
	const shadow = host.attachShadow({ mode: options.kind === 'shadow' ? options.mode : 'open' });
	const inner = document.createElement('div');
	shadow.append(inner);
	createOctaneRoot(inner).render(isSlot ? OctaneFixture.SlotInner : OctaneFixture.Inner, props);
	targets.octane = (isSlot ? host : inner).querySelector<HTMLElement>('[data-target]')!;
	if (isSlot) slot = inner.querySelector<HTMLSlotElement>('slot')!;
}

window.__eventBoundaries = {
	logs,
	mount(options: ProbeOptions) {
		if (options.kind === 'shadow' || options.kind === 'slot') mountShadow(options);
		else {
			for (const runtime of ['octane', 'react'] as const) {
				if (options.kind === 'same-root') mountSameRoot(runtime, options.scenario);
				else mountNested(runtime, options.stop);
			}
		}
	},
	clickPoint(runtime: RuntimeName) {
		const rect = targets[runtime]!.getBoundingClientRect();
		return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
	},
	slotDistributesTarget() {
		return (
			slot instanceof HTMLSlotElement &&
			slot.assignedElements().length === 1 &&
			slot.assignedElements()[0] === targets.octane &&
			targets.octane?.assignedSlot === slot
		);
	},
};

declare global {
	interface Window {
		__eventBoundaries: {
			logs: Record<RuntimeName, HandlerRecord[]>;
			mount(options: ProbeOptions): void;
			clickPoint(runtime: RuntimeName): { x: number; y: number };
			slotDistributesTarget(): boolean;
		};
	}
}
