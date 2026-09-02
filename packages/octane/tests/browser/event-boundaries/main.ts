/// <reference path="./react-fixture.d.ts" />

import { createRoot as createOctaneRoot } from '../../../src/index.js';
import { createRoot as createReactRoot } from 'react-dom/client';
import { flushSync as flushReactSync } from 'react-dom';
import { createElement, useState } from 'react';
import * as OctaneFixture from '../../_fixtures/event-boundaries.tsrx';
import {
	CommitTiming as OctaneCommitTiming,
	ControlledCapture as OctaneControlledCapture,
} from '../../_fixtures/event-commit-timing.tsrx';
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
	| { kind: 'slot' }
	| { kind: 'commit-timing' }
	| { kind: 'controlled-capture'; stop: boolean };
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

// The click handler schedules a state update; a native document listener (an
// outside event system further along the path) records the target's text when
// the event reaches it, and the harness can also dispatch the click from script.
function ReactCommitTiming(props: EventProbeProps) {
	const [count, setCount] = useState(0);
	return createElement(
		'section',
		{
			'data-name': 'timing',
			onClick: (event: { nativeEvent: Event }) => {
				setCount(count + 1);
				props.record('inner:bubble', event as unknown as Event);
			},
		},
		createElement('button', { 'data-name': 'target', 'data-target': '' }, String(count)),
	);
}

function mountCommitTiming(runtime: RuntimeName): void {
	const container = containers[runtime];
	const props: EventProbeProps = { record: (label, event) => record(runtime, label, event) };
	if (runtime === 'octane') createOctaneRoot(container).render(OctaneCommitTiming, props);
	else {
		flushReactSync(() => {
			createReactRoot(container).render(createElement(ReactCommitTiming, props));
		});
	}
	const target = container.querySelector<HTMLElement>('[data-target]')!;
	targets[runtime] = target;
	document.addEventListener('click', (event) => {
		if (container.contains(event.target as Node))
			record(runtime, `native:document:${target.textContent ?? ''}`, event);
	});
}

// The controlled input's React counterpart. onChange is React's per-keystroke
// text handler; it is dispatched from the same native `input` event as
// Octane's onInput.
function ReactControlledCapture(props: EventProbeProps) {
	const [value, setValue] = useState('');
	return createElement(
		'section',
		{
			'data-name': 'form',
			onInputCapture: (event: { nativeEvent: Event }) =>
				props.record('form:capture', event as unknown as Event),
		},
		createElement('input', {
			'data-name': 'target',
			'data-target': '',
			value,
			onChange: (event: { nativeEvent: Event; currentTarget: HTMLInputElement }) => {
				setValue(event.currentTarget.value);
				props.record('target:bubble', event as unknown as Event);
			},
		}),
		createElement('output', { 'data-output': '' }, value),
	);
}

function mountControlledCapture(runtime: RuntimeName, stop: boolean): void {
	const container = containers[runtime];
	const props: EventProbeProps = { record: (label, event) => record(runtime, label, event) };
	if (runtime === 'octane') createOctaneRoot(container).render(OctaneControlledCapture, props);
	else {
		flushReactSync(() => {
			createReactRoot(container).render(createElement(ReactControlledCapture, props));
		});
	}
	const target = container.querySelector<HTMLInputElement>('[data-target]')!;
	targets[runtime] = target;
	// An outside listener on the input itself runs between the root's capture
	// and bubble listeners. It records the value the user's edit left in the
	// field; stopping there keeps the bubble segment from ever reaching the root.
	target.addEventListener('input', (event) => {
		record(runtime, `native:target:${target.value}`, event);
		if (stop) event.stopPropagation();
	});
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
				else if (options.kind === 'commit-timing') mountCommitTiming(runtime);
				else if (options.kind === 'controlled-capture')
					mountControlledCapture(runtime, options.stop);
				else mountNested(runtime, options.stop);
			}
		}
	},
	scriptClick(runtime: RuntimeName) {
		targets[runtime]!.click();
	},
	targetText(runtime: RuntimeName) {
		return targets[runtime]!.textContent ?? '';
	},
	fieldState(runtime: RuntimeName) {
		const input = targets[runtime] as HTMLInputElement;
		return {
			value: input.value,
			output: containers[runtime].querySelector('[data-output]')?.textContent ?? '',
			selectionStart: input.selectionStart,
			selectionEnd: input.selectionEnd,
			focused: document.activeElement === input,
		};
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
			scriptClick(runtime: RuntimeName): void;
			targetText(runtime: RuntimeName): string;
			fieldState(runtime: RuntimeName): {
				value: string;
				output: string;
				selectionStart: number | null;
				selectionEnd: number | null;
				focused: boolean;
			};
			slotDistributesTarget(): boolean;
		};
	}
}
