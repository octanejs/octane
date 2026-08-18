import { createRoot, flushSync } from 'octane';
import { App, CallbackSiteControl, type AppProps, type CallbackSiteControlProps } from './App.tsrx';
import { LANES, ROW_COUNT, UPDATE_COUNT, isCallbackLane, operationsFor } from './contract.mjs';
import { createModel, type Callback, type Lane, type Operation } from './model';

const parameters = new URLSearchParams(location.search);
const requestedLane = parameters.get('lane') ?? 'callback-direct';
if (!LANES.includes(requestedLane)) throw new Error(`Unknown lane: ${requestedLane}`);
const lane = requestedLane as Lane;
const diagnosticsEnabled = parameters.get('diagnostics') === '1';
const container = document.getElementById('app');
const controlContainer = document.getElementById('callback-control');
const callbackOutput = document.getElementById('callback-result');
if (!container || !controlContainer || !callbackOutput) {
	throw new Error('Missing hook/store benchmark containers');
}

type Mounted = {
	root: ReturnType<typeof createRoot>;
	props: AppProps;
	nodes: Element[];
	callbacks: Callback[];
};
let mounted: Mounted | null = null;
let nestedControlVerified = false;

function ensure(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(`${lane}: ${message}`);
}

function current(): Mounted {
	ensure(mounted !== null, 'the fixture is not mounted');
	return mounted;
}

function status() {
	return {
		rows: container.querySelectorAll('[data-row-index]').length,
		ready: mounted?.props.model.ready ?? false,
		...(mounted?.props.model.readDiagnostics() ?? {}),
	};
}

async function waitUntil(predicate: () => boolean, phase: string): Promise<void> {
	const deadline = performance.now() + 10_000;
	while (!predicate()) {
		ensure(performance.now() < deadline, `${phase} timed out: ${JSON.stringify(status())}`);
		await new Promise<void>((resolve) => setTimeout(resolve, 16));
	}
}

function render(): void {
	const state = current();
	flushSync(() => state.root.render(App, state.props));
}

function expectedValue(state: Mounted, index: number): number {
	return (
		(isCallbackLane(lane) ? state.props.value : state.props.model.base) +
		index +
		(state.props.alternate ? 1000 : 0)
	);
}

function verifyRows(): Element[] {
	const state = current();
	const nodes = Array.from(container.querySelectorAll('[data-row-index]'));
	ensure(nodes.length === ROW_COUNT, `expected ${ROW_COUNT} visible rows, got ${nodes.length}`);
	for (let index = 0; index < ROW_COUNT; index++) {
		const node = nodes[index];
		ensure(node.getAttribute('data-row-index') === String(index), `row ${index} moved`);
		ensure(
			node.textContent === String(expectedValue(state, index)),
			`row ${index} has stale output`,
		);
		ensure(
			node.getAttribute('data-generation') === String(state.props.generation),
			`row ${index} did not receive parent generation ${state.props.generation}`,
		);
		if (state.nodes.length !== 0) {
			ensure(node === state.nodes[index], `row ${index} lost its DOM identity`);
		}
	}
	return nodes;
}

function probeCallbacks(): Callback[] {
	const state = current();
	state.props.model.clearCallbackReports();
	for (const node of verifyRows()) {
		ensure(node instanceof HTMLButtonElement, 'a callback row is not a native button');
		node.click();
	}
	const reports = state.props.model.callbackReports();
	const callbacks = reports.map((report, index) => {
		ensure(report !== undefined, `callback ${index} was not delivered`);
		ensure(
			report.value === expectedValue(state, index),
			`callback ${index} captured a stale value`,
		);
		return report.callback;
	});
	ensure(new Set(callbacks).size === ROW_COUNT, 'independent rows shared a callback');
	ensure(
		callbackOutput.textContent === `${ROW_COUNT - 1}:${expectedValue(state, ROW_COUNT - 1)}`,
		'the native callback did not reach its visible consumer',
	);
	return callbacks;
}

function verifyNestedCallSites(): void {
	if (lane !== 'callback-nested' || nestedControlVerified) return;
	const reports = new Map<number, { value: number; callback: Callback }>();
	const root = createRoot(controlContainer);
	let props: CallbackSiteControlProps = {
		report: (index, value, callback) => reports.set(index, { value, callback }),
		left: 10,
		right: 20,
		dependencies: [0],
		generation: 0,
	};
	const probe = () => {
		reports.clear();
		for (const side of ['left', 'right']) {
			const button = controlContainer.querySelector(`[data-control="${side}"]`);
			ensure(button instanceof HTMLButtonElement, `missing nested ${side} control`);
			button.click();
		}
		const left = reports.get(0);
		const right = reports.get(1);
		ensure(left?.value === props.left, 'the first nested call site captured the wrong value');
		ensure(
			right?.value === props.right + 1,
			'the second nested call site captured the wrong value',
		);
		ensure(left.callback !== right.callback, 'nested call sites shared a callback cell');
		return [left.callback, right.callback];
	};
	try {
		flushSync(() => root.render(CallbackSiteControl, props));
		const first = probe();
		props = { ...props, generation: 1 };
		flushSync(() => root.render(CallbackSiteControl, props));
		const unchanged = probe();
		ensure(
			unchanged[0] === first[0] && unchanged[1] === first[1],
			'equal nested dependencies changed callback identities',
		);
		props = { ...props, left: 30, right: 40, dependencies: [1], generation: 2 };
		flushSync(() => root.render(CallbackSiteControl, props));
		const changed = probe();
		ensure(
			changed[0] !== first[0] && changed[1] !== first[1],
			'changed nested dependencies retained stale callbacks',
		);
		nestedControlVerified = true;
	} finally {
		flushSync(() => root.unmount());
		reports.clear();
		ensure(controlContainer.childNodes.length === 0, 'nested call-site control did not unmount');
	}
}

async function cleanup() {
	if (mounted === null) return null;
	const state = mounted;
	try {
		flushSync(() => state.root.unmount());
		await waitUntil(
			() => !state.props.model.ready && state.props.model.activeSubscribers() === 0,
			'teardown',
		);
		ensure(container.childNodes.length === 0, 'unmount left visible content behind');
		const beforeProbe = state.props.model.readDiagnostics();
		if (diagnosticsEnabled && !isCallbackLane(lane)) {
			if (lane === 'mobx') {
				ensure(
					beforeProbe.observedTransitions === beforeProbe.unobservedTransitions,
					'a MobX computed value remained observed',
				);
			} else {
				ensure(
					beforeProbe.subscribeCalls === beforeProbe.unsubscribeCalls &&
						beforeProbe.subscribeCalls === beforeProbe.unsubscribeInvocations &&
						beforeProbe.duplicateUnsubscribes === 0,
					'a vanilla-store subscription was not cleaned up exactly once',
				);
			}
			state.props.model.writeSelected(state.props.model.base + 1);
			const afterProbe = state.props.model.readDiagnostics();
			ensure(afterProbe.notifications === beforeProbe.notifications, 'an unmounted listener fired');
			ensure(afterProbe.selectorCalls === beforeProbe.selectorCalls, 'an unmounted selector ran');
		}
		return state.props.model.readDiagnostics();
	} finally {
		state.props.model.clearCallbackReports();
		state.callbacks.length = 0;
		state.props.model.disposeDiagnostics();
		mounted = null;
	}
}

async function prepare(operation: Operation): Promise<void> {
	ensure(operationsFor(lane).includes(operation), `unsupported operation ${operation}`);
	await cleanup();
	verifyNestedCallSites();
	const model = createModel(lane, diagnosticsEnabled, (value) => {
		callbackOutput.textContent = value;
	});
	mounted = {
		root: createRoot(container),
		props: { lane, model, generation: 0, value: 0, dependencies: [0], alternate: false },
		nodes: [],
		callbacks: [],
	};
	render();
	if (!isCallbackLane(lane)) {
		// Observer tracking alone happens before MobX's uSES subscription is
		// installed. The passive acknowledgment and real write/restore below are
		// both required before an update sample is allowed to start.
		await waitUntil(
			() => model.ready && model.activeSubscribers() === ROW_COUNT,
			'subscription readiness',
		);
		flushSync(() => model.writeSelected(1));
		verifyRows();
		flushSync(() => model.writeSelected(0));
		verifyRows();
	}
	const state = current();
	state.nodes = verifyRows();
	if (isCallbackLane(lane)) state.callbacks = probeCallbacks();
}

function run(operation: Operation): void {
	const state = current();
	ensure(operationsFor(lane).includes(operation), `unsupported operation ${operation}`);
	for (let index = 0; index < UPDATE_COUNT; index++) {
		if (operation === 'parent_rerenders' || operation === 'changed_dependencies') {
			const value = state.props.value + (operation === 'changed_dependencies' ? 1 : 0);
			state.props = {
				...state.props,
				generation: state.props.generation + 1,
				value,
				dependencies: operation === 'changed_dependencies' ? [value] : state.props.dependencies,
			};
			render();
		} else {
			flushSync(() => {
				if (operation === 'unchanged_selection') state.props.model.publishUnchanged(index);
				else state.props.model.publishChanged(index);
			});
		}
	}
}

function verify(operation: Operation) {
	const state = current();
	verifyRows();
	if (isCallbackLane(lane)) {
		const callbacks = probeCallbacks();
		for (let index = 0; index < ROW_COUNT; index++) {
			ensure(
				(callbacks[index] === state.callbacks[index]) === (operation === 'parent_rerenders'),
				`callback ${index} has the wrong dependency identity`,
			);
		}
	}
	return {
		rows: ROW_COUNT,
		generation: state.props.generation,
		first: expectedValue(state, 0),
		last: expectedValue(state, ROW_COUNT - 1),
		retainedNodes: state.nodes.length,
	};
}

function confirmLiveWrite(): void {
	if (isCallbackLane(lane)) return;
	const state = current();
	if (lane === 'zustand-traditional') {
		// Replacing a selector is a separate semantic control, not a claim that
		// an inline selector must have any particular compiler-generated identity.
		state.props = { ...state.props, alternate: true, generation: state.props.generation + 1 };
		render();
		verifyRows();
	}
	flushSync(() => state.props.model.writeSelected(state.props.model.base + 1));
	verifyRows();
}

const api = {
	prepare,
	run,
	verify,
	confirmLiveWrite,
	cleanup,
	diagnostics: () => current().props.model.readDiagnostics(),
};
function runWithSynchronousPostcondition(operation: Operation): void {
	run(operation);
	verifyRows();
}
const benchmarkWindow = window as typeof window & {
	__ready?: boolean;
	__hookStoreBench?: typeof api;
	__hookStorePrepare?: typeof prepare;
	__hookStoreRun?: typeof runWithSynchronousPostcondition;
	__hookStoreVerify?: typeof verify;
	__hookStoreCleanup?: typeof cleanup;
};
benchmarkWindow.__hookStoreBench = api;
benchmarkWindow.__hookStorePrepare = prepare;
benchmarkWindow.__hookStoreRun = runWithSynchronousPostcondition;
benchmarkWindow.__hookStoreVerify = verify;
benchmarkWindow.__hookStoreCleanup = cleanup;
benchmarkWindow.__ready = true;
