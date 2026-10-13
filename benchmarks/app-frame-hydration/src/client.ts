import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { AppFrame, BoundedAppFrame } from './frame.tsrx';
import {
	BOUNDARIES,
	FRAME_PROPS,
	resetSettled,
	whenSettled,
	frameData,
	SCENARIOS,
	searchOpen$,
	type FrameData,
	type Scenario,
} from './state';

export interface FrameHydration {
	durationMs: number;
	elements: number;
	replaced: number;
	recoverableErrors: number;
	interactionHandled: boolean;
	unmountClean: boolean;
}

interface PreparedFrame {
	container: HTMLElement;
	scenario: Scenario;
	data: FrameData;
	serverElements: Element[];
}

let prepared: PreparedFrame | null = null;
let active:
	| (PreparedFrame & {
			root: ReturnType<typeof hydrateRoot>;
			errors: unknown[];
			durationMs: number;
	  })
	| null = null;

/**
 * Record the server-rendered frame before hydration, outside the measured
 * window. Hydration consumes the native-signal seed script, which is not
 * adopted output, so the adoption check skips scripts.
 */
export function prepareFrame(container: HTMLElement, scenario: Scenario): void {
	if (prepared !== null || active !== null) throw new Error('A frame is already prepared.');
	prepared = {
		container,
		scenario,
		data: frameData(),
		serverElements: Array.from(container.querySelectorAll(':not(script)')),
	};
}

/** Hydrate the prepared frame; returns the elapsed milliseconds. */
export function hydrateFrame(): number {
	if (prepared === null) throw new Error('No frame is prepared.');
	const frame = prepared;
	prepared = null;
	const errors: unknown[] = [];
	const started = performance.now();
	const root = hydrateRoot(
		frame.container,
		frame.scenario === 'frame-boundaries' ? BoundedAppFrame : AppFrame,
		{ ...FRAME_PROPS, ...SCENARIOS[frame.scenario], data: frame.data },
		{ onRecoverableError: (error) => errors.push(error) },
	);
	// Hydration commits schedule follow-up work, such as releasing adopted server
	// signal values, for the same task. Drain it so the sample covers the task.
	flushSync(() => {});
	const durationMs = performance.now() - started;
	active = { ...frame, root, errors, durationMs };
	return durationMs;
}

/**
 * Hydrate the prepared frame, then wait until every Suspense boundary in it has
 * committed, which can take later host tasks. The marks bound the trace window,
 * which also takes in the passive effects that would otherwise run after paint,
 * so a candidate that runs some of them sooner is not charged for them alone.
 * Returns the hydrateRoot task's milliseconds, as hydrateFrame does.
 */
export async function hydrateFrameSettled(): Promise<number> {
	const count = BOUNDARIES[prepared!.scenario];
	resetSettled();
	performance.mark('hydrate-start');
	const durationMs = hydrateFrame();
	await whenSettled(count);
	drainPassiveEffects();
	performance.mark('hydrate-settled');
	return durationMs;
}

/**
 * Click the first collapsible sidebar section as soon as hydrateRoot returns,
 * before any later task runs, and report whether the click collapsed it once
 * the frame settled.
 */
export async function clickBeforeSettled(): Promise<boolean> {
	const count = BOUNDARIES[prepared!.scenario];
	resetSettled();
	const container = prepared!.container;
	const lists = () => container.querySelectorAll('.nav-list').length;
	const before = lists();
	hydrateFrame();
	container.querySelector<HTMLElement>('.nav-section-header button')!.click();
	await whenSettled(count);
	flushSync(() => {});
	const collapsed = lists() === before - 1;
	active!.root.unmount();
	active = null;
	return collapsed;
}

/**
 * Prove the hydration was a real adoption, then unmount: every server element
 * survives, a delegated click reaches a component and re-renders the arm that
 * reads the store (natively, or through useSyncExternalStore in the plain
 * twin, which subscribes in a passive effect), and unmount leaves no DOM behind.
 */
export function verifyFrame(): FrameHydration {
	if (active === null) throw new Error('No hydrated frame to verify.');
	const { container, root, serverElements, errors, durationMs } = active;
	active = null;
	const hydratedElements = container.querySelectorAll(':not(script)');
	let replaced = Math.abs(hydratedElements.length - serverElements.length);
	for (let index = 0; index < serverElements.length; index++) {
		if (hydratedElements[index] !== serverElements[index]) replaced++;
	}

	drainPassiveEffects();
	const search = container.querySelector<HTMLElement>('.sidebar-header-actions button');
	if (search !== null) flushSync(() => search.click());
	const opened = container.querySelector('.search-dialog') !== null;
	flushSync(() => searchOpen$.set(false));
	const interactionHandled = opened && container.querySelector('.search-dialog') === null;

	root.unmount();
	return {
		durationMs,
		elements: serverElements.length,
		replaced,
		recoverableErrors: errors.length,
		interactionHandled,
		unmountClean: container.childNodes.length === 0,
	};
}
