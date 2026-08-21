import {
	createRoot,
	flushSync,
	startTransition,
	type ViewTransitionInstance,
} from '../../../src/index.js';
import {
	ActivityTransitionApp,
	WrappedActivityTransitionApp,
	type ActivityTransitionProps,
} from '../../conformance/_fixtures/view-transition.tsrx';

type Status = 'pending' | 'fulfilled' | 'rejected';
type Activation = 'enter' | 'exit' | 'update';
interface NativeObservation {
	ready: Status;
	update: Status;
	finished: Status;
}

const container = document.querySelector('#root') as HTMLElement;
const Host =
	new URLSearchParams(location.search).get('placement') === 'inside'
		? WrappedActivityTransitionApp
		: ActivityTransitionApp;
const events: Array<{ kind: Activation; name: string; hasAnimation: boolean }> = [];
const nativeCalls: NativeObservation[] = [];
const pending: Promise<void>[] = [];
const nativeStartViewTransition = document.startViewTransition;
if (typeof nativeStartViewTransition !== 'function') {
	throw new Error('This test requires the native document.startViewTransition API');
}

// Observe the browser boundary, but keep the native callback scheduling, capture,
// promises and animation objects intact. No View Transition mock runs here.
document.startViewTransition = function (...args) {
	const transition = Reflect.apply(nativeStartViewTransition, document, args) as ViewTransition;
	const observation: NativeObservation = {
		ready: 'pending',
		update: 'pending',
		finished: 'pending',
	};
	nativeCalls.push(observation);
	pending.push(
		(async () => {
			const outcomes = await Promise.allSettled([
				transition.ready,
				transition.updateCallbackDone,
				transition.finished,
			]);
			observation.ready = outcomes[0].status;
			observation.update = outcomes[1].status;
			observation.finished = outcomes[2].status;
		})(),
	);
	return transition;
};

function record(kind: Activation, instance: ViewTransitionInstance): void {
	events.push({
		kind,
		name: instance.name,
		hasAnimation: instance[kind === 'exit' ? 'old' : 'new'].getAnimations().length > 0,
	});
}

const props: ActivityTransitionProps = {
	mode: 'hidden',
	text: 'initial',
	onEnter: (instance) => record('enter', instance),
	onExit: (instance) => record('exit', instance),
	onUpdate: (instance) => record('update', instance),
};
const root = createRoot(container);
root.render(Host, props);
const initialPanel = container.querySelector('#activity-transition-panel') as HTMLElement;
const initialInput = container.querySelector('#activity-transition-input') as HTMLInputElement;

function snapshot() {
	const panel = container.querySelector('#activity-transition-panel') as HTMLElement;
	const input = container.querySelector('#activity-transition-input') as HTMLInputElement;
	return {
		connected: panel.isConnected && input.isConnected,
		hidden: getComputedStyle(panel).display === 'none',
		panelIdentity: panel === initialPanel,
		inputIdentity: input === initialInput,
		inputValue: input.value,
		text: panel.querySelector('span')!.textContent,
		transitionName: panel.style.viewTransitionName,
	};
}

function render(mode: ActivityTransitionProps['mode'], text: string) {
	const mark = { nativeStart: nativeCalls.length, eventStart: events.length };
	startTransition(() => root.render(Host, { ...props, mode, text }));
	return mark;
}

async function settle(mark: ReturnType<typeof render>) {
	// The driver may skip a hidden-only update before or after calling the native
	// API. The caller first observes the committed DOM, then waits for any native
	// handles that actually exist, without assuming an internal flush count.
	for (let i = mark.nativeStart; i < pending.length; i++) await pending[i];
	return {
		...snapshot(),
		events: events.slice(mark.eventStart),
		nativeCalls: nativeCalls.slice(mark.nativeStart),
	};
}

window.__activityViewTransition = {
	render,
	settle,
	snapshot,
	async unmount() {
		try {
			flushSync(() => root.unmount());
			await Promise.all(pending);
		} finally {
			document.startViewTransition = nativeStartViewTransition;
		}
	},
};

declare global {
	interface Window {
		__activityViewTransition: {
			render: typeof render;
			settle: typeof settle;
			snapshot: typeof snapshot;
			unmount(): Promise<void>;
		};
	}
}
