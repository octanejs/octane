import { attachBehaviorRoot } from 'octane/behavior';
import type { IndependentHydrateActivator } from 'octane/hydration';
import { adoptActions, adoptFrame } from './candidate-adapter.tsrx';
import { createMetricsController } from './candidate-controller.ts';

type Choice = { island: Element; frame: Element };
type Probe = typeof globalThis & {
	__metricsSelectionRelease?: () => void;
	__metricsActionsRelease?: () => void;
	__octaneIslandsFirstCheckpoint?: {
		metricsModuleId?: string;
		metricsModuleUrl?: string;
		metricsClientBuildId?: string;
		metricsActivated?: string;
	};
	__metricsCandidate?: {
		status(): object;
		resetForNegativeControl(): void;
	};
};
let choice: Choice | undefined;

function candidateChoice(): Choice | undefined {
	const frames = document.querySelectorAll('section.metrics[aria-label="Capture measurements"]');
	if (frames.length !== 1) return;
	const frame = frames[0];
	const island = frame.closest('[data-octane-hydrate-independent]');
	if (!island || island.getAttribute('data-octane-hydrate-when') !== 'load') return;
	if (
		!island.getAttribute('data-octane-hydrate-id') ||
		frame.querySelectorAll('dl.timings > div').length !== 4 ||
		frame.querySelectorAll('details > ol.observation-log').length !== 1
	)
		return;
	return { island, frame };
}

// The generated loader calls this before it releases captured island intents.
// This is a pinned benchmark shape guard, not a general DOM ownership proof.
export async function selectMetricsBinding(): Promise<boolean> {
	const params = new URL(location.href).searchParams;
	if (params.get('__metricsSelect') === 'throw') throw new Error('Requested selector failure');
	if (params.get('__metricsSelect') === 'false') return false;
	if (params.get('__metricsSelect') === 'hold') {
		await new Promise<void>((resolve) => {
			(globalThis as Probe).__metricsSelectionRelease = resolve;
		});
	}
	choice = candidateChoice();
	return choice !== undefined;
}

const activate: IndependentHydrateActivator = (context) => {
	const selected = choice;
	const current = candidateChoice();
	const manifest = context.manifest;
	const checkpoint = (globalThis as Probe).__octaneIslandsFirstCheckpoint;
	const valid =
		selected !== undefined &&
		current !== undefined &&
		selected.island === context.element &&
		selected.island === current.island &&
		selected.frame === current.frame &&
		context.signalOwner !== undefined &&
		manifest.moduleId === checkpoint?.metricsModuleId &&
		manifest.buildId === checkpoint?.metricsClientBuildId &&
		new URL(manifest.moduleId, location.href).href === checkpoint?.metricsModuleUrl &&
		manifest.boundaryId === context.element.getAttribute('data-octane-hydrate-id') &&
		manifest.hookSeed === 3456549929 &&
		manifest.idSeed === 750830155 &&
		manifest.captures.length === 0 &&
		manifest.captureSchema.length === 0 &&
		manifest.signalSites.length === 0 &&
		manifest.styles.length === 0 &&
		manifest.exportName === 'default' &&
		manifest.parentDependencies === false;
	const unsupportedIntent = context.intents.some((intent) => {
		if (intent.earlyBinding) return false;
		const target = intent.event.target;
		return (
			intent.event.type !== 'click' ||
			!(target instanceof Element) ||
			!target.matches('button[type="button"]') ||
			(target.isConnected && !target.closest('.capture-actions')) ||
			intent.selection !== undefined
		);
	});
	if (!valid || unsupportedIntent) {
		if (checkpoint) checkpoint.metricsActivated = 'ordinary-after-selection';
		// No binding has been claimed, but this asynchronous post-selection path
		// has a known event-capture gap; it is a diagnostic, not general recovery.
		return import('virtual:ordinary-metrics-activator').then((module) => module.default(context));
	}
	const controller = createMetricsController(context.signalOwner!);
	const lifetime = new AbortController();
	let frameHandle: ReturnType<typeof adoptFrame> | undefined;
	let actionsAdoptions = 0;
	const receivedIntents = context.intents.length;
	let replayedIntents = 0;
	let failure: string | null = null;
	let stopped = false;
	let pendingIntents = [...context.intents];
	let releaseActions: () => void;
	const actionsGate = new Promise<void>((resolve) => {
		releaseActions = resolve;
	});
	if (new URL(location.href).searchParams.get('__metricsActionsHold') === '1') {
		(globalThis as Probe).__metricsActionsRelease = releaseActions!;
	} else {
		releaseActions!();
	}
	const stop = () => {
		if (stopped) return;
		stopped = true;
		lifetime.abort();
		frameHandle?.dispose();
		controller.dispose();
	};
	const fail = (error: unknown) => {
		failure = String(error);
		stop();
	};
	try {
		frameHandle = adoptFrame(selected.frame, controller.frame, lifetime.signal);
		const root = attachBehaviorRoot(selected.frame, { signal: lifetime.signal });
		const registration = root.registerBehavior({
			target: '.capture-actions > button[type="button"]',
			events: ['click'],
			ready: Promise.all([controller.ready, actionsGate]),
			adopt(button, behavior) {
				try {
					const actions = button.closest('.capture-actions');
					if (!actions || !selected.frame.contains(actions))
						throw new Error('Metrics actions left their owner');
					const handle = adoptActions(actions, controller.actions, behavior.signal);
					actionsAdoptions++;
					const replays = pendingIntents;
					pendingIntents = [];
					for (const intent of replays) {
						if (intent.earlyBinding || (intent.current && !intent.current())) continue;
						const target = intent.event.target;
						if (
							target === button &&
							context.element.isConnected &&
							button.isConnected &&
							context.element.ownerDocument === document &&
							context.element.contains(button)
						) {
							replayedIntents++;
							controller.onExport();
						}
					}
					return () => handle.dispose();
				} catch (error) {
					fail(error);
					throw error;
				}
			},
			handleEvent(event, button) {
				if (event.eventPhase === Event.NONE && event.target === button && button.isConnected)
					controller.onExport();
			},
		});
		void registration.ready.catch(fail);
		if (checkpoint) checkpoint.metricsActivated = 'binding';
	} catch (error) {
		fail(error);
		throw error;
	}
	(globalThis as Probe).__metricsCandidate = {
		status: () => ({
			...controller.status(),
			actionsAdoptions,
			receivedIntents,
			replayedIntents,
			failure,
			connected: selected.frame.isConnected,
		}),
		resetForNegativeControl: controller.resetForNegativeControl,
	};
	return {
		unmount: stop,
	};
};

export default activate;
