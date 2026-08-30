import {
	Suspense,
	useCallback,
	useEffect,
	useLayoutEffect,
	useState,
	useTransition,
	version,
} from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

interface ProbeResult {
	name: string;
	reactVersion: string;
	observations: Record<string, unknown>;
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

class ObservationSignal extends EventTarget {
	notify(): void {
		this.dispatchEvent(new Event('change'));
	}
}

// Mutations observe rendered output, while the signal covers effects and the
// application's resource/subscription callbacks. The timer is a failure deadline,
// not a delay used to guess when React has finished work.
function waitFor(
	condition: () => boolean,
	label: string,
	signal: ObservationSignal,
	observedNodes: Node[],
): Promise<void> {
	return new Promise((resolve, reject) => {
		const observer = new MutationObserver(check);
		const deadline = setTimeout(() => {
			cleanup();
			reject(new Error(`Probe did not converge: ${label}`));
		}, 5_000);

		function cleanup(): void {
			clearTimeout(deadline);
			observer.disconnect();
			signal.removeEventListener('change', check);
		}

		function check(): void {
			try {
				if (!condition()) return;
				cleanup();
				resolve();
			} catch (error) {
				cleanup();
				reject(error);
			}
		}

		for (const node of observedNodes) {
			observer.observe(node, {
				childList: true,
				subtree: true,
				characterData: true,
				attributes: true,
			});
		}
		signal.addEventListener('change', check);
		check();
	});
}

let nextProbeId = 0;

function createScene(name: string) {
	assert(version === '19.2.7', `These controls require React 19.2.7; loaded ${version}.`);
	const section = document.createElement('section');
	section.dataset.probe = name;
	const heading = document.createElement('h2');
	heading.textContent = name;
	const host = document.createElement('div');
	const portalTarget = document.createElement('div');
	portalTarget.dataset.portalTarget = name;
	section.append(heading, host, portalTarget);
	document.querySelector('#probe-arena')!.append(section);
	return { id: ++nextProbeId, section, host, portalTarget };
}

function visible(element: Element | null): boolean {
	return element !== null && element.getClientRects().length > 0;
}

function resource(signal: ObservationSignal) {
	let value: string | undefined;
	let release!: () => void;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return {
		requested: false,
		read(): string {
			if (value !== undefined) return value;
			// This is application resource access, not a React render-count oracle.
			// It proves the blocked transition was attempted before we sample it.
			this.requested = true;
			signal.notify();
			throw promise;
		},
		resolve(): void {
			value = 'resolved';
			release();
		},
	};
}

async function runSuspension(kind: 'urgent' | 'transition'): Promise<ProbeResult> {
	const scene = createScene(`${kind}-suspension`);
	const signal = new ObservationSignal();
	const requestedResource = resource(signal);
	const observer = { fallbackSeen: false, fallbackActive: false };
	let retainedAcrossPaint = false;
	let root: Root | undefined;

	function Fallback() {
		useEffect(() => {
			observer.fallbackSeen = true;
			observer.fallbackActive = true;
			signal.notify();
			return () => {
				observer.fallbackActive = false;
				signal.notify();
			};
		}, []);
		return <output data-fallback="">fallback</output>;
	}

	function Content({ requested }: { requested: boolean }) {
		return <output data-content="">{requested ? requestedResource.read() : 'initial'}</output>;
	}

	function App() {
		const [requested, setRequested] = useState(false);
		const [pending, startTransition] = useTransition();
		return (
			<>
				<button
					data-trigger=""
					onClick={() => {
						if (kind === 'transition') startTransition(() => setRequested(true));
						else setRequested(true);
					}}
				>
					Request {kind} content
				</button>
				<output data-pending="">{pending ? 'pending' : 'idle'}</output>
				<Suspense fallback={<Fallback />}>
					<Content requested={requested} />
				</Suspense>
			</>
		);
	}

	try {
		root = createRoot(scene.host);
		root.render(<App />);
		const content = () => scene.host.querySelector('[data-content]');
		const fallback = () => scene.host.querySelector('[data-fallback]');
		const pending = () => scene.host.querySelector('[data-pending]')?.textContent;
		await waitFor(() => content()?.textContent === 'initial', 'initial content committed', signal, [
			scene.host,
		]);
		const initialNode = content();
		scene.host.querySelector<HTMLButtonElement>('[data-trigger]')!.click();

		if (kind === 'urgent') {
			await waitFor(
				() => requestedResource.requested && observer.fallbackActive && visible(fallback()),
				'urgent suspension commits the observed fallback',
				signal,
				[scene.host],
			);
		} else {
			await waitFor(
				() =>
					requestedResource.requested &&
					pending() === 'pending' &&
					content()?.textContent === 'initial',
				'transition waits while committed content remains',
				signal,
				[scene.host],
			);
			const retainedWhileBlocked = () =>
				pending() === 'pending' &&
				content() === initialNode &&
				content()?.textContent === 'initial' &&
				visible(content()) &&
				!visible(fallback()) &&
				!observer.fallbackSeen;
			assert(retainedWhileBlocked(), 'The blocked transition did not retain its visible screen.');
			// Keep the resource blocked across a browser paint opportunity instead
			// of resolving it immediately from the resource-read notification. This
			// observes this episode's retained UI; it is not a claim about arbitrary
			// suspension duration, and no settling delay is guessed from a timer.
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			});
			assert(
				retainedWhileBlocked(),
				'The blocked transition changed its retained screen across the paint opportunity.',
			);
			retainedAcrossPaint = true;
		}

		const waiting = {
			resourceRequested: requestedResource.requested,
			transitionPending: pending() === 'pending',
			fallbackEffectObserved: observer.fallbackSeen,
			fallbackEffectActive: observer.fallbackActive,
			fallbackVisible: visible(fallback()),
			previousContentVisible: visible(content()) && content()?.textContent === 'initial',
			previousContentIdentityPreserved: content() === initialNode,
			retainedAcrossPaint,
		};
		if (kind === 'urgent') {
			assert(
				waiting.fallbackEffectObserved && waiting.fallbackVisible,
				'Urgent fallback was not observable.',
			);
		} else {
			assert(waiting.transitionPending, 'React did not report the local transition as pending.');
			assert(
				waiting.previousContentVisible && waiting.previousContentIdentityPreserved,
				'Transition did not retain previous content.',
			);
			assert(
				!waiting.fallbackEffectObserved && !waiting.fallbackVisible,
				'Transition unexpectedly committed the root fallback.',
			);
		}

		requestedResource.resolve();
		await waitFor(
			() =>
				content()?.textContent === 'resolved' && pending() === 'idle' && !observer.fallbackActive,
			'resolved content commits and transition/fallback settles',
			signal,
			[scene.host],
		);
		if (kind === 'transition') {
			assert(
				!observer.fallbackSeen,
				'Fallback observer activated during the completed transition.',
			);
		}
		return {
			name: `${kind}-suspension`,
			reactVersion: version,
			observations: {
				waiting,
				settled: {
					content: content()?.textContent,
					transitionPending: pending() === 'pending',
					fallbackEffectEverObserved: observer.fallbackSeen,
				},
			},
		};
	} finally {
		root?.unmount();
		scene.section.remove();
	}
}

interface LifecycleObservation {
	refActive: boolean;
	refAttachedWhileConnected: boolean | undefined;
	layoutActive: boolean;
	passiveActive: boolean;
	lastMessage: string;
	cleanups: Set<string>;
}

async function runRootLifecycle(mode: 'detached' | 'hidden'): Promise<ProbeResult> {
	const scene = createScene(`${mode}-root`);
	const signal = new ObservationSignal();
	const eventName = `react-compat-probe-message-${scene.id}`;
	const model: LifecycleObservation = {
		refActive: false,
		refAttachedWhileConnected: undefined,
		layoutActive: false,
		passiveActive: false,
		lastMessage: 'initial',
		cleanups: new Set(),
	};
	let root: Root | undefined;
	if (mode === 'detached') scene.host.remove();

	function Lifecycle() {
		const [message, setMessage] = useState('initial');
		const ref = useCallback((node: HTMLOutputElement | null) => {
			if (node === null) return;
			model.refActive = true;
			model.refAttachedWhileConnected = node.isConnected;
			signal.notify();
			return () => {
				model.refActive = false;
				model.cleanups.add('ref');
				signal.notify();
			};
		}, []);
		useLayoutEffect(() => {
			model.layoutActive = true;
			signal.notify();
			return () => {
				model.layoutActive = false;
				model.cleanups.add('layout');
				signal.notify();
			};
		}, []);
		useEffect(() => {
			const receive = (event: Event) => {
				const value = (event as CustomEvent<string>).detail;
				model.lastMessage = value;
				setMessage(value);
				signal.notify();
			};
			window.addEventListener(eventName, receive);
			model.passiveActive = true;
			signal.notify();
			return () => {
				window.removeEventListener(eventName, receive);
				model.passiveActive = false;
				model.cleanups.add('passive');
				signal.notify();
			};
		}, []);
		return (
			<>
				<output ref={ref} data-local="">
					{message}
				</output>
				{createPortal(<output data-external="">{message}</output>, scene.portalTarget)}
			</>
		);
	}

	const observe = [scene.host, scene.portalTarget];
	const isActive = () => model.refActive && model.layoutActive && model.passiveActive;
	const external = () => scene.portalTarget.querySelector('[data-external]');
	const send = (message: string) =>
		window.dispatchEvent(new CustomEvent(eventName, { detail: message }));
	try {
		root = createRoot(scene.host);
		root.render(<Lifecycle />);
		await waitFor(
			() => isActive() && external()?.textContent === 'initial',
			'refs, effects, and external portal committed',
			signal,
			observe,
		);
		const localNode = scene.host.querySelector('[data-local]');
		if (mode === 'hidden') scene.host.hidden = true;
		send(`while-${mode}`);
		await waitFor(
			() => model.lastMessage === `while-${mode}` && external()?.textContent === `while-${mode}`,
			`${mode} root receives subscription events and updates its external portal`,
			signal,
			observe,
		);
		const beforeUnmount = {
			hostConnected: scene.host.isConnected,
			hostHidden: scene.host.hidden,
			localVisible: visible(localNode),
			localIdentityPreserved: scene.host.querySelector('[data-local]') === localNode,
			refAttachedWhileConnected: model.refAttachedWhileConnected,
			refActive: model.refActive,
			layoutActive: model.layoutActive,
			passiveActive: model.passiveActive,
			subscriptionMessage: model.lastMessage,
			externalPortalVisible: visible(external()),
			externalPortalContent: external()?.textContent,
			cleanups: [...model.cleanups],
		};
		assert(
			isActive() && model.cleanups.size === 0,
			`${mode} host unexpectedly cleaned up React work.`,
		);
		assert(beforeUnmount.localIdentityPreserved, `${mode} host lost its committed local DOM.`);
		assert(
			!beforeUnmount.localVisible && beforeUnmount.externalPortalVisible,
			`${mode} host did not isolate local visibility from its external portal.`,
		);
		if (mode === 'detached') {
			assert(
				!beforeUnmount.hostConnected && beforeUnmount.refAttachedWhileConnected === false,
				'Detached probe committed into a connected host.',
			);
		} else {
			assert(
				beforeUnmount.hostConnected && beforeUnmount.hostHidden,
				'Hidden probe did not hide a connected host.',
			);
			scene.host.hidden = false;
			assert(
				visible(localNode) && scene.host.querySelector('[data-local]') === localNode,
				'Revealing the host did not preserve its live React content.',
			);
		}

		root.unmount();
		root = undefined;
		await waitFor(
			() => !model.refActive && !model.layoutActive && !model.passiveActive && external() === null,
			'unmount cleans up refs, effects, and external portal',
			signal,
			observe,
		);
		send('after-unmount');
		assert(
			model.lastMessage === `while-${mode}`,
			'Subscription still received events after root unmount.',
		);
		assert(
			model.cleanups.has('ref') && model.cleanups.has('layout') && model.cleanups.has('passive'),
			'Unmount missed observable lifecycle cleanup.',
		);
		return {
			name: `${mode}-root`,
			reactVersion: version,
			observations: {
				beforeUnmount,
				afterUnmount: {
					refActive: model.refActive,
					layoutActive: model.layoutActive,
					passiveActive: model.passiveActive,
					subscriptionMessage: model.lastMessage,
					externalPortalPresent: external() !== null,
					cleanups: [...model.cleanups].sort(),
				},
			},
		};
	} finally {
		root?.unmount();
		scene.section.remove();
	}
}

const probes = {
	reactVersion: version,
	runUrgentSuspension: () => runSuspension('urgent'),
	runTransitionSuspension: () => runSuspension('transition'),
	runDetachedRoot: () => runRootLifecycle('detached'),
	runHiddenRoot: () => runRootLifecycle('hidden'),
	async runAll(): Promise<ProbeResult[]> {
		return [
			await runSuspension('urgent'),
			await runSuspension('transition'),
			await runRootLifecycle('detached'),
			await runRootLifecycle('hidden'),
		];
	},
};

declare global {
	interface Window {
		reactCompatProbes: typeof probes;
	}
}

window.reactCompatProbes = probes;
const controls = document.querySelector('#probe-controls')!;
const status = document.querySelector('#probe-status')!;
const output = document.querySelector('#probe-results')!;
const actions = [
	['Run all probes', () => probes.runAll()],
	['Urgent suspension', () => probes.runUrgentSuspension()],
	['Transition suspension', () => probes.runTransitionSuspension()],
	['Detached root', () => probes.runDetachedRoot()],
	['Hidden root', () => probes.runHiddenRoot()],
] as const;
for (const [label, run] of actions) {
	const button = document.createElement('button');
	button.textContent = label;
	button.addEventListener('click', async () => {
		const buttons = controls.querySelectorAll('button');
		for (const control of buttons) control.disabled = true;
		status.textContent = `Running: ${label}`;
		try {
			output.textContent = JSON.stringify(await run(), null, 2);
			status.textContent = 'Passed';
		} catch (error) {
			output.textContent = error instanceof Error ? (error.stack ?? error.message) : String(error);
			status.textContent = 'Failed';
		} finally {
			for (const control of buttons) control.disabled = false;
		}
	});
	controls.append(button);
}
status.textContent = `Ready — React ${version}`;
