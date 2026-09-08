import { useCallback, useEffect, useLayoutEffect, useState, version } from 'react';
import { createPortal } from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import type { Root } from 'react-dom/client';

interface CommitToken {
	readonly id: number;
	readonly status: 'held' | 'committing' | 'committed' | 'aborted' | 'failed';
	accept(): boolean;
	abort(): boolean;
}

interface CommitGate {
	readonly pending: CommitToken | null;
	dispose(): void;
}

interface CandidateAPI {
	attachCommitGate(
		root: Root,
		options: {
			onPrepared(token: CommitToken): void;
			onAborted?(token: CommitToken, reason: string): void;
		},
	): CommitGate;
}

interface ProbeResult {
	name: string;
	reactVersion: string;
	observations: Record<string, unknown>;
}

// This type describes only the patch's experimental public surface. The fixture
// never inspects the renderer's root, Fiber, lane, or update-queue fields.
const candidateAPI = ReactDOMClient as unknown as CandidateAPI;

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

class Signal extends EventTarget {
	notify(): void {
		this.dispatchEvent(new Event('change'));
	}
}

function waitFor(
	condition: () => boolean,
	label: string,
	signal: Signal,
	nodes: Node[],
): Promise<void> {
	return new Promise((resolve, reject) => {
		const observer = new MutationObserver(check);
		// This is a failure deadline, not a guessed React settling delay.
		const deadline = setTimeout(() => {
			cleanup();
			reject(new Error(`Candidate probe did not converge: ${label}`));
		}, 5_000);
		function cleanup() {
			clearTimeout(deadline);
			observer.disconnect();
			signal.removeEventListener('change', check);
		}
		function check() {
			try {
				if (!condition()) return;
				cleanup();
				resolve();
			} catch (error) {
				cleanup();
				reject(error);
			}
		}
		for (const node of nodes) {
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

let nextSceneId = 0;

function scene(name: string) {
	assert(version === '19.2.7', `These probes require React 19.2.7; loaded ${version}.`);
	assert(
		typeof candidateAPI.attachCommitGate === 'function',
		'Patched react-dom/client was not loaded.',
	);
	const section = document.createElement('section');
	const heading = document.createElement('h2');
	heading.textContent = name;
	section.append(heading);
	document.querySelector('#candidate-arena')!.append(section);
	return { id: ++nextSceneId, name, section };
}

type Scene = ReturnType<typeof scene>;

function createGatedRoot(owner: Scene, name: string, readSibling?: () => string | null) {
	const host = document.createElement('div');
	const portalTarget = document.createElement('div');
	host.dataset.root = name;
	portalTarget.dataset.portal = name;
	owner.section.append(host, portalTarget);
	const signal = new Signal();
	const prepared: CommitToken[] = [];
	const aborted: Array<{ id: number; reason: string }> = [];
	const model = {
		refActive: false,
		layoutValue: null as string | null,
		passiveValue: null as string | null,
		subscribed: false,
		lastMessage: null as string | null,
		layoutValues: new Set<string>(),
		passiveValues: new Set<string>(),
		cleanups: new Set<string>(),
		layoutReads: [] as Array<{ value: string; sibling: string | null }>,
	};
	const eventName = `react-candidate-message-${owner.id}-${name}`;
	const root = ReactDOMClient.createRoot(host);
	const gate = candidateAPI.attachCommitGate(root, {
		onPrepared(token) {
			prepared.push(token);
			signal.notify();
		},
		onAborted(token, reason) {
			aborted.push({ id: token.id, reason });
			signal.notify();
		},
	});

	function App() {
		const [value, setValue] = useState('initial');
		const ref = useCallback((node: HTMLOutputElement | null) => {
			if (node === null) return;
			model.refActive = true;
			signal.notify();
			return () => {
				model.refActive = false;
				model.cleanups.add('ref');
				signal.notify();
			};
		}, []);
		useLayoutEffect(() => {
			model.layoutValue = value;
			model.layoutValues.add(value);
			if (readSibling) model.layoutReads.push({ value, sibling: readSibling() });
			signal.notify();
			return () => {
				model.layoutValue = null;
				model.cleanups.add('layout');
				signal.notify();
			};
		}, [value]);
		useEffect(() => {
			model.passiveValue = value;
			model.passiveValues.add(value);
			signal.notify();
			return () => {
				model.passiveValue = null;
				model.cleanups.add('passive');
				signal.notify();
			};
		}, [value]);
		useEffect(() => {
			const receive = (event: Event) => {
				model.lastMessage = (event as CustomEvent<string>).detail;
				signal.notify();
			};
			window.addEventListener(eventName, receive);
			model.subscribed = true;
			signal.notify();
			return () => {
				window.removeEventListener(eventName, receive);
				model.subscribed = false;
				model.cleanups.add('subscription');
				signal.notify();
			};
		}, []);
		return (
			<>
				<button data-change="candidate" onClick={() => setValue('candidate')}>
					Prepare candidate
				</button>
				<button data-change="latest" onClick={() => setValue('latest')}>
					Prepare latest
				</button>
				<output ref={ref} data-value="">
					{value}
				</output>
				{createPortal(<output data-portal-value="">{value}</output>, portalTarget)}
			</>
		);
	}

	const localNode = () => host.querySelector('[data-value]');
	const value = () => localNode()?.textContent ?? null;
	const portalValue = () => portalTarget.querySelector('[data-portal-value]')?.textContent ?? null;
	const snapshot = () => ({
		content: value(),
		portalContent: portalValue(),
		refActive: model.refActive,
		layoutValue: model.layoutValue,
		passiveValue: model.passiveValue,
		subscribed: model.subscribed,
		lastMessage: model.lastMessage,
		layoutValues: [...model.layoutValues],
		passiveValues: [...model.passiveValues],
	});
	const wait = (condition: () => boolean, label: string) =>
		waitFor(condition, label, signal, [host, portalTarget]);
	const nextPrepared = async (previous: CommitToken | null = null): Promise<CommitToken> => {
		await wait(
			() => gate.pending !== null && gate.pending !== previous && prepared.includes(gate.pending),
			'new completed candidate reported',
		);
		const token = gate.pending;
		assert(token !== null && token.status === 'held', 'Reported candidate was not held.');
		return token;
	};
	const committed = (expected: string) =>
		wait(
			() =>
				value() === expected &&
				portalValue() === expected &&
				model.refActive &&
				model.layoutValue === expected &&
				model.passiveValue === expected &&
				model.subscribed,
			`${expected} DOM, portal, refs, effects, and subscription committed`,
		);
	return {
		root,
		gate,
		host,
		portalTarget,
		model,
		aborted,
		wait,
		value,
		portalValue,
		localNode,
		snapshot,
		nextPrepared,
		committed,
		start() {
			root.render(<App />);
		},
		click(next: 'candidate' | 'latest') {
			const button = host.querySelector<HTMLButtonElement>(`[data-change="${next}"]`);
			assert(button, `Committed ${next} control is missing.`);
			button.click();
		},
		send(message: string) {
			window.dispatchEvent(new CustomEvent(eventName, { detail: message }));
		},
	};
}

type GatedRoot = ReturnType<typeof createGatedRoot>;

function createUngatedRoot(owner: Scene) {
	const host = document.createElement('div');
	host.dataset.root = 'ungated';
	owner.section.append(host);
	const signal = new Signal();
	const model = {
		refActive: false,
		layoutValue: null as string | null,
		passiveValue: null as string | null,
	};
	// This is deliberately the same patched client as createGatedRoot. No gate
	// is attached: a pending candidate elsewhere must not intercept this root.
	const root = ReactDOMClient.createRoot(host);

	function App() {
		const [value, setValue] = useState('ungated-initial');
		const ref = useCallback((node: HTMLOutputElement | null) => {
			if (node === null) return;
			model.refActive = true;
			signal.notify();
			return () => {
				model.refActive = false;
				signal.notify();
			};
		}, []);
		useLayoutEffect(() => {
			model.layoutValue = value;
			signal.notify();
			return () => {
				model.layoutValue = null;
				signal.notify();
			};
		}, [value]);
		useEffect(() => {
			model.passiveValue = value;
			signal.notify();
			return () => {
				model.passiveValue = null;
				signal.notify();
			};
		}, [value]);
		return (
			<>
				<button data-ungated-update="" onClick={() => setValue('ungated-updated')}>
					Update ungated root
				</button>
				<output ref={ref} data-ungated-value="">
					{value}
				</output>
			</>
		);
	}

	const node = () => host.querySelector('[data-ungated-value]');
	const snapshot = () => ({ content: node()?.textContent ?? null, ...model });
	return {
		root,
		node,
		snapshot,
		start() {
			root.render(<App />);
		},
		update() {
			const button = host.querySelector<HTMLButtonElement>('[data-ungated-update]');
			assert(button, 'Ungated update control is missing.');
			button.click();
		},
		committed(expected: string) {
			return waitFor(
				() =>
					node()?.textContent === expected &&
					model.refActive &&
					model.layoutValue === expected &&
					model.passiveValue === expected,
				`${expected} ungated DOM, ref, and effects committed`,
				signal,
				[host],
			);
		},
	};
}

async function mountAccepted(rig: GatedRoot): Promise<CommitToken> {
	rig.start();
	const token = await rig.nextPrepared();
	assert(token.accept(), 'Initial candidate could not be accepted.');
	await rig.committed('initial');
	assert(token.status === 'committed', 'Accepted initial candidate did not report committed.');
	return token;
}

function unchanged(rig: GatedRoot, initialNode: Element | null, forbiddenValue: string): void {
	assert(
		rig.value() === 'initial' && rig.portalValue() === 'initial',
		'Held candidate changed committed DOM or portal output.',
	);
	assert(rig.localNode() === initialNode, 'Held candidate replaced committed DOM identity.');
	assert(
		rig.model.layoutValue === 'initial' && rig.model.passiveValue === 'initial',
		'Held candidate changed active effects.',
	);
	assert(
		!rig.model.layoutValues.has(forbiddenValue) && !rig.model.passiveValues.has(forbiddenValue),
		'Unaccepted candidate ran effects.',
	);
}

function result(name: string, observations: Record<string, unknown>): ProbeResult {
	return { name, reactVersion: version, observations };
}

async function runInitialHold(): Promise<ProbeResult> {
	const owner = scene('initial-commit-held');
	const rig = createGatedRoot(owner, 'root');
	try {
		rig.start();
		const token = await rig.nextPrepared();
		rig.send('before-accept');
		const held = rig.snapshot();
		assert(
			rig.host.textContent === '' && rig.portalTarget.textContent === '',
			'Initial hold exposed DOM or portal output.',
		);
		assert(
			!held.refActive &&
				held.layoutValue === null &&
				held.passiveValue === null &&
				!held.subscribed &&
				held.lastMessage === null,
			'Initial hold ran a ref, effect, or subscription.',
		);
		assert(token.accept(), 'Initial held candidate was not accepted.');
		await rig.committed('initial');
		rig.send('after-accept');
		assert(
			rig.model.lastMessage === 'after-accept',
			'Accepted subscription did not receive an event.',
		);
		return result(owner.name, { tokenStatus: token.status, held, accepted: rig.snapshot() });
	} finally {
		rig.gate.dispose();
		owner.section.remove();
	}
}

async function runInternalUpdate(): Promise<ProbeResult> {
	const owner = scene('internal-state-update-held');
	const rig = createGatedRoot(owner, 'root');
	try {
		await mountAccepted(rig);
		const initialNode = rig.localNode();
		rig.click('candidate');
		const token = await rig.nextPrepared();
		unchanged(rig, initialNode, 'candidate');
		const held = rig.snapshot();
		assert(token.accept(), 'React-local state candidate was not accepted.');
		await rig.committed('candidate');
		assert(
			rig.localNode() === initialNode,
			'Accepted state update unnecessarily replaced its output node.',
		);
		return result(owner.name, { held, accepted: rig.snapshot(), tokenStatus: token.status });
	} finally {
		rig.gate.dispose();
		owner.section.remove();
	}
}

async function runSupersededCandidate(): Promise<ProbeResult> {
	const owner = scene('superseded-candidate-rejected');
	const rig = createGatedRoot(owner, 'root');
	try {
		await mountAccepted(rig);
		const initialNode = rig.localNode();
		rig.click('candidate');
		const oldToken = await rig.nextPrepared();
		rig.click('latest');
		const latestToken = await rig.nextPrepared(oldToken);
		await rig.wait(
			() => rig.aborted.some(({ id }) => id === oldToken.id),
			'superseded candidate reports abortion',
		);
		const lateAccept = oldToken.accept();
		assert(
			oldToken.status === 'aborted' && !lateAccept,
			'Superseded candidate remained acceptable.',
		);
		unchanged(rig, initialNode, 'candidate');
		unchanged(rig, initialNode, 'latest');
		assert(latestToken.accept(), 'Latest candidate was not accepted.');
		await rig.committed('latest');
		assert(
			!rig.model.layoutValues.has('candidate') && !rig.model.passiveValues.has('candidate'),
			'Superseded candidate ran effects.',
		);
		return result(owner.name, {
			lateAccept,
			oldTokenStatus: oldToken.status,
			latestTokenStatus: latestToken.status,
			accepted: rig.snapshot(),
			aborted: rig.aborted,
		});
	} finally {
		rig.gate.dispose();
		owner.section.remove();
	}
}

async function runExplicitAbort(): Promise<ProbeResult> {
	const owner = scene('explicit-abort-preserves-committed-ui');
	const rig = createGatedRoot(owner, 'root');
	try {
		await mountAccepted(rig);
		const initialNode = rig.localNode();
		rig.click('candidate');
		const token = await rig.nextPrepared();
		assert(token.abort(), 'Held candidate could not be aborted.');
		await rig.wait(
			() => rig.aborted.some(({ id }) => id === token.id),
			'explicit abort notification',
		);
		const lateAccept = token.accept();
		assert(
			token.status === 'aborted' && rig.gate.pending === null && !lateAccept,
			'Explicitly aborted candidate remained pending or acceptable.',
		);
		unchanged(rig, initialNode, 'candidate');
		rig.send('after-abort');
		assert(
			rig.model.lastMessage === 'after-abort',
			'Aborting candidate removed the committed subscription.',
		);
		const afterAbort = rig.snapshot();
		// Abortion must not leave the root permanently suspended. A later public
		// state update has to prepare and commit while the aborted token stays inert.
		rig.click('latest');
		const recoveredToken = await rig.nextPrepared(token);
		unchanged(rig, initialNode, 'latest');
		assert(recoveredToken.accept(), 'A new update could not be accepted after explicit abort.');
		await rig.committed('latest');
		assert(
			!rig.model.layoutValues.has('candidate') && !rig.model.passiveValues.has('candidate'),
			'Recovery ran effects from the explicitly aborted candidate.',
		);
		return result(owner.name, {
			lateAccept,
			tokenStatus: token.status,
			afterAbort,
			recovered: rig.snapshot(),
			recoveredTokenStatus: recoveredToken.status,
			aborted: rig.aborted,
		});
	} finally {
		rig.gate.dispose();
		owner.section.remove();
	}
}

async function runDisposeHeldCandidate(): Promise<ProbeResult> {
	const owner = scene('dispose-revokes-held-candidate');
	const rig = createGatedRoot(owner, 'root');
	try {
		await mountAccepted(rig);
		rig.send('before-dispose');
		rig.click('candidate');
		const token = await rig.nextPrepared();
		rig.gate.dispose();
		await rig.wait(
			() =>
				!rig.model.refActive &&
				rig.model.layoutValue === null &&
				rig.model.passiveValue === null &&
				!rig.model.subscribed &&
				rig.value() === null &&
				rig.portalValue() === null,
			'disposal removes DOM, portal, refs, effects, and subscription',
		);
		const lateAccept = token.accept();
		assert(
			token.status === 'aborted' && !lateAccept,
			'Disposal did not revoke the held candidate.',
		);
		rig.send('after-dispose');
		assert(
			rig.model.lastMessage === 'before-dispose',
			'Disposed root still received subscription events.',
		);
		assert(
			!rig.model.layoutValues.has('candidate') && !rig.model.passiveValues.has('candidate'),
			'Disposal ran candidate effects.',
		);
		for (const name of ['ref', 'layout', 'passive', 'subscription']) {
			assert(rig.model.cleanups.has(name), `Disposal missed ${name} cleanup.`);
		}
		return result(owner.name, {
			lateAccept,
			tokenStatus: token.status,
			afterDispose: rig.snapshot(),
			cleanups: [...rig.model.cleanups].sort(),
		});
	} finally {
		rig.gate.dispose();
		owner.section.remove();
	}
}

async function runUngatedRootWhileCandidateHeld(): Promise<ProbeResult> {
	const owner = scene('ungated-root-progresses-while-candidate-held');
	const gated = createGatedRoot(owner, 'gated');
	const ungated = createUngatedRoot(owner);
	try {
		await mountAccepted(gated);
		const gatedNode = gated.localNode();
		gated.click('candidate');
		const token = await gated.nextPrepared();
		unchanged(gated, gatedNode, 'candidate');

		ungated.start();
		await ungated.committed('ungated-initial');
		const ungatedInitial = ungated.snapshot();
		const ungatedNode = ungated.node();
		ungated.update();
		await ungated.committed('ungated-updated');
		const ungatedUpdated = ungated.snapshot();
		assert(ungated.node() === ungatedNode, 'Ungated state update replaced its committed node.');
		assert(
			token.status === 'held',
			'Ungated progress accepted or invalidated the other candidate.',
		);
		unchanged(gated, gatedNode, 'candidate');
		const heldGated = gated.snapshot();

		assert(token.accept(), 'The gated candidate stopped being acceptable after ungated progress.');
		await gated.committed('candidate');
		assert(
			ungated.node() === ungatedNode && ungated.node()?.textContent === 'ungated-updated',
			'Accepting the gated root disturbed the independent ungated root.',
		);
		return result(owner.name, {
			heldGated,
			ungatedInitial,
			ungatedUpdated,
			acceptedGated: gated.snapshot(),
			ungatedAfterGateAcceptance: ungated.snapshot(),
		});
	} finally {
		try {
			ungated.root.unmount();
		} finally {
			try {
				gated.gate.dispose();
			} finally {
				owner.section.remove();
			}
		}
	}
}

async function runSequentialRootAcceptance(): Promise<ProbeResult> {
	const owner = scene('sequential-roots-are-not-atomic');
	let right: GatedRoot | undefined;
	const left = createGatedRoot(owner, 'left', () => right?.value() ?? null);
	right = createGatedRoot(owner, 'right', () => left.value());
	try {
		await mountAccepted(left);
		await mountAccepted(right);
		left.click('candidate');
		right.click('candidate');
		const [leftToken, rightToken] = await Promise.all([left.nextPrepared(), right.nextPrepared()]);
		assert(
			left.value() === 'initial' && right.value() === 'initial',
			'Held roots changed before admission.',
		);
		assert(leftToken.accept(), 'First root candidate was not accepted.');
		const firstLayoutRead = left.model.layoutReads.find(({ value }) => value === 'candidate');
		assert(
			firstLayoutRead?.sibling === 'initial',
			'First root layout effect did not observe the still-old sibling root.',
		);
		const betweenAccepts = { left: left.value(), right: right.value() };
		assert(rightToken.accept(), 'Second root candidate was not accepted.');
		await Promise.all([left.committed('candidate'), right.committed('candidate')]);
		return result(owner.name, {
			firstLayoutRead,
			betweenAccepts,
			settled: { left: left.value(), right: right.value() },
			atomicAcrossRoots: firstLayoutRead.sibling !== 'initial',
		});
	} finally {
		left.gate.dispose();
		right.gate.dispose();
		owner.section.remove();
	}
}

const probes = {
	reactVersion: version,
	runInitialHold,
	runInternalUpdate,
	runSupersededCandidate,
	runExplicitAbort,
	runDisposeHeldCandidate,
	runUngatedRootWhileCandidateHeld,
	runSequentialRootAcceptance,
	async runAll(): Promise<ProbeResult[]> {
		return [
			await runInitialHold(),
			await runInternalUpdate(),
			await runSupersededCandidate(),
			await runExplicitAbort(),
			await runDisposeHeldCandidate(),
			await runUngatedRootWhileCandidateHeld(),
			await runSequentialRootAcceptance(),
		];
	},
};

declare global {
	interface Window {
		reactCommitGateProbes: typeof probes;
	}
}

window.reactCommitGateProbes = probes;
const controls = document.querySelector('#candidate-controls')!;
const status = document.querySelector('#candidate-status')!;
const output = document.querySelector('#candidate-results')!;
const button = document.createElement('button');
button.textContent = 'Run candidate probes';
button.addEventListener('click', async () => {
	button.disabled = true;
	status.textContent = 'Running candidate probes';
	try {
		output.textContent = JSON.stringify(await probes.runAll(), null, 2);
		status.textContent = 'Passed';
	} catch (error) {
		output.textContent = error instanceof Error ? (error.stack ?? error.message) : String(error);
		status.textContent = 'Failed';
	} finally {
		button.disabled = false;
	}
});
controls.append(button);
status.textContent = `Ready — React ${version}`;
