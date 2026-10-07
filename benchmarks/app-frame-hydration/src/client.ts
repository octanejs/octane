import { flushSync, hydrateRoot } from 'octane';
import { AppFrame } from './frame.tsrx';
import {
	FRAME_PROPS,
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
		AppFrame,
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
 * Prove the hydration was a real adoption, then unmount: every server element
 * survives, a delegated click reaches a component and re-renders a native-read
 * arm, and unmount leaves no DOM behind.
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
