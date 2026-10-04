/**
 * Timing workload for the real Octane Lynx dual-thread path.
 *
 * It drives the production background root, the production async transport,
 * and the production main-thread receiver/host driver over an in-process
 * ContextProxy pair, with a minimal fake Element PAPI standing in for the
 * native engine. The fake PAPI is deliberately cheap so the measurement is
 * Octane's own per-node CPU cost rather than native element allocation. This
 * makes no native paint, layout, or device claim.
 *
 * First-screen scenarios take the separately compiled main-thread layer
 * (`main-workload.ts`) and install its receiver instead, so the main thread
 * paints with its own specialization of the fixture before the background
 * adopts the tree.
 */
import { createLynxRoot, type LynxRoot } from '../../packages/lynx/src/index.js';
import { installLynxMainThread } from '../../packages/lynx/src/main-thread.js';
import type {
	LynxContextProxy,
	LynxContextProxyEvent,
} from '../../packages/lynx/src/core/protocol.js';
import {
	LYNX_BACKGROUND_TO_MAIN_EVENT,
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
} from '../../packages/lynx/src/core/protocol.js';
import type { LynxElementEventListener } from '../../packages/lynx/src/core/papi.js';
import {
	decodeLynxTransportValue,
	encodeLynxTransportValue,
} from '../../packages/lynx/src/core/transport-codec.js';
import { BenchApp, EmptyApp, renderCounts, type BenchRow } from './src/App.lynx.tsrx';
import type * as MainThreadLayerModule from './main-workload.ts';

/** The compiled main-thread layer module, imported by the runner. */
export type MainThreadLayerBundle = typeof MainThreadLayerModule;

interface FakeNode {
	readonly sign: number;
	readonly type: string;
	parent: FakeNode | null;
	readonly children: FakeNode[];
	classes: string;
	id: string | null;
	text: string;
	attributes: Map<string, unknown> | null;
	events: Map<string, LynxElementEventListener> | null;
}

export interface ContextPair {
	readonly background: LynxContextProxy;
	readonly main: LynxContextProxy;
	readonly messages: readonly LynxContextProxyEvent[];
}

type Listener = (event: LynxContextProxyEvent) => void;

/**
 * Two cross-wired synchronous ContextProxy ends. Dispatching on one end runs
 * the other end's listeners, matching the direction the real dual-thread
 * ContextProxy uses without introducing scheduling noise into the timings.
 */
export function createContextPair(): ContextPair {
	const backgroundListeners = new Map<string, Listener[]>();
	const mainListeners = new Map<string, Listener[]>();
	const messages: LynxContextProxyEvent[] = [];
	const end = (own: Map<string, Listener[]>, other: Map<string, Listener[]>): LynxContextProxy => ({
		addEventListener(type, listener) {
			const list = own.get(type);
			if (list === undefined) own.set(type, [listener]);
			else list.push(listener);
		},
		removeEventListener(type, listener) {
			const list = own.get(type);
			if (list === undefined) return;
			const index = list.indexOf(listener);
			if (index !== -1) list.splice(index, 1);
			if (list.length === 0) own.delete(type);
		},
		dispatchEvent(event) {
			messages.push(event);
			const list = other.get(event.type);
			if (list === undefined) return;
			for (const listener of list.slice()) listener(event);
		},
	});
	return {
		background: end(backgroundListeners, mainListeners),
		main: end(mainListeners, backgroundListeners),
		messages,
	};
}

export class FakeElementPAPI {
	private nextSign = 1;
	readonly nodes = new Map<number, FakeNode>();
	flushes = 0;
	createdElements = 0;
	onSetId: ((node: FakeNode, value: string | null) => void) | null = null;
	/**
	 * Element PAPI calls by name, or null when not counting. Counting wraps every
	 * global, so the runner enables it only for untimed validation runs.
	 */
	readonly calls: Map<string, number> | null;

	constructor(options: { readonly countCalls?: boolean } = {}) {
		this.calls = options.countCalls === true ? new Map() : null;
	}

	private create(type: string, text = ''): FakeNode {
		const sign = this.nextSign++;
		const node: FakeNode = {
			sign,
			type,
			parent: null,
			children: [],
			classes: '',
			id: null,
			text,
			attributes: null,
			events: null,
		};
		this.nodes.set(sign, node);
		this.createdElements++;
		return node;
	}

	/** Element PAPI globals consumed by `createLynxElementPAPI`. */
	globals(): Record<string, unknown> {
		const globals = this.uncountedGlobals();
		const calls = this.calls;
		if (calls === null) return globals;
		for (const [name, value] of Object.entries(globals)) {
			if (typeof value !== 'function') continue;
			globals[name] = (...args: unknown[]) => {
				calls.set(name, (calls.get(name) ?? 0) + 1);
				return (value as (...args: unknown[]) => unknown)(...args);
			};
		}
		return globals;
	}

	private uncountedGlobals(): Record<string, unknown> {
		return {
			__CreatePage: (_componentId: string, _cssId: number) => this.create('page'),
			__CreateElement: (type: string) => this.create(type),
			__CreateView: () => this.create('view'),
			__CreateScrollView: () => this.create('scroll-view'),
			__CreateText: () => this.create('text'),
			__CreateRawText: (text: string) => this.create('raw-text', text),
			__CreateImage: () => this.create('image'),
			__GetElementUniqueID: (node: FakeNode) => node.sign,
			__GetParent: (node: FakeNode) => node.parent,
			__ElementIsEqual: (first: FakeNode, second: FakeNode) => first === second,
			__InsertElementBefore: (parent: FakeNode, child: FakeNode, before?: FakeNode) => {
				if (child.parent !== null) {
					const previous = child.parent.children.indexOf(child);
					if (previous !== -1) child.parent.children.splice(previous, 1);
				}
				const index = before === undefined ? -1 : parent.children.indexOf(before);
				if (index === -1) parent.children.push(child);
				else parent.children.splice(index, 0, child);
				child.parent = parent;
			},
			__RemoveElement: (parent: FakeNode, child: FakeNode) => {
				const index = parent.children.indexOf(child);
				if (index !== -1) parent.children.splice(index, 1);
				child.parent = null;
			},
			__ReplaceElement: (replacement: FakeNode, previous: FakeNode) => {
				const parent = previous.parent;
				if (parent === null) return;
				const index = parent.children.indexOf(previous);
				if (index !== -1) parent.children.splice(index, 1, replacement);
				replacement.parent = parent;
				previous.parent = null;
			},
			__SetClasses: (node: FakeNode, value: string) => {
				node.classes = value;
			},
			__SetInlineStyles: (node: FakeNode, value: unknown) => {
				(node.attributes ??= new Map()).set('style', value);
			},
			__SetCSSId: (_node: FakeNode, _id: number, _entryName?: string) => {},
			__SetAttribute: (node: FakeNode, name: string, value: unknown) => {
				if (name === 'text') node.text = String(value);
				else (node.attributes ??= new Map()).set(name, value);
			},
			__SetDataset: (node: FakeNode, value: unknown) => {
				(node.attributes ??= new Map()).set('dataset', value);
			},
			__AddEvent: (
				node: FakeNode,
				kind: string,
				name: string,
				listener: LynxElementEventListener,
			) => {
				const events = (node.events ??= new Map());
				if (listener === undefined) events.delete(`${kind}:${name}`);
				else events.set(`${kind}:${name}`, listener);
			},
			__SetID: (node: FakeNode, id: string | null) => {
				node.id = id;
				this.onSetId?.(node, id);
			},
			__FlushElementTree: () => {
				this.flushes++;
			},
		};
	}

	/** Depth-first text checksum proving a run actually materialized its rows. */
	checksum(): number {
		let hash = 0x811c9dc5;
		for (const node of this.nodes.values()) {
			const text = `${node.type}|${node.classes}|${node.id ?? ''}|${node.text}`;
			for (let index = 0; index < text.length; index++) {
				hash ^= text.charCodeAt(index);
				hash = Math.imul(hash, 0x01000193) >>> 0;
			}
		}
		return hash >>> 0;
	}

	/**
	 * Canonical visible-tree checksum independent of host allocation order.
	 * ReactLynx creates a snapshot's static nodes before its dynamic text slots,
	 * while Octane allocates in traversal order; both must expose the same tree.
	 */
	reachableChecksum(): number {
		const page = [...this.nodes.values()].find(
			(node) => node.type === 'page' && node.parent === null,
		);
		if (page === undefined) return 0;
		let hash = 0x811c9dc5;
		const stack = [page];
		while (stack.length !== 0) {
			const node = stack.pop()!;
			const attributes =
				node.attributes === null
					? ''
					: [...node.attributes]
							.filter(([name]) => name !== 'octane-ref')
							.sort(([first], [second]) => first.localeCompare(second))
							.join('|');
			const events = node.events === null ? '' : [...node.events.keys()].sort().join('|');
			const text = `${node.type}|${node.classes}|${node.id ?? ''}|${node.text}|${attributes}|${events}|${node.children.length}\0`;
			for (let index = 0; index < text.length; index++) {
				hash ^= text.charCodeAt(index);
				hash = Math.imul(hash, 0x01000193) >>> 0;
			}
			for (let index = node.children.length - 1; index >= 0; index--) {
				stack.push(node.children[index]!);
			}
		}
		return hash >>> 0;
	}

	/** Every `bind*` token installed on the fake tree, in creation order. */
	eventTokens(): string[] {
		const tokens: string[] = [];
		for (const node of this.nodes.values()) {
			if (node.events === null) continue;
			for (const listener of node.events.values()) {
				if (typeof listener === 'string') tokens.push(listener);
			}
		}
		return tokens;
	}

	/** Renderer-private query selectors, counted only after a timing sample ends. */
	privateRefSelectors(): number {
		let count = 0;
		for (const node of this.nodes.values()) {
			if (node.attributes?.has('octane-ref') === true) count++;
		}
		return count;
	}

	rootChildId(): string | null {
		const page = [...this.nodes.values()].find(
			(node) => node.type === 'page' && node.parent === null,
		);
		return page?.children[0]?.id ?? null;
	}

	/** Every host reachable from the page, depth first, as element identities. */
	reachableNodes(): FakeNode[] {
		const page = [...this.nodes.values()].find(
			(node) => node.type === 'page' && node.parent === null,
		);
		const nodes: FakeNode[] = [];
		const stack = page === undefined ? [] : [page];
		while (stack.length !== 0) {
			const node = stack.pop()!;
			nodes.push(node);
			for (let index = node.children.length - 1; index >= 0; index--) {
				stack.push(node.children[index]!);
			}
		}
		return nodes;
	}
}

export interface Harness {
	readonly papi: FakeElementPAPI;
	readonly root: LynxRoot;
	readonly main: ReturnType<typeof installLynxMainThread>;
	/** The compiled main-thread layer, when the harness paints a first screen. */
	readonly mainLayer: MainThreadLayerModule.MainThreadLayer | null;
	readonly diagnostics: Error[];
	/** Background globals, including the engine's `lynxCoreInject.tt` hook. */
	readonly backgroundTarget: Record<string, unknown>;
	/** Frozen wire messages, retained solely for post-timing structural checks. */
	readonly transportMessages: readonly LynxContextProxyEvent[];
	dispose(): Promise<void>;
}

export interface HarnessOptions {
	/** Install the compiled main-thread layer's receiver, which can paint a first screen. */
	readonly mainLayer?: MainThreadLayerBundle;
	readonly countCalls?: boolean;
}

export function createHarness(options: HarnessOptions = {}): Harness {
	const contexts = createContextPair();
	const papi = new FakeElementPAPI({ countCalls: options.countCalls });
	const diagnostics: Error[] = [];
	const emitter = {
		addListener() {},
		removeListener() {},
		emit() {},
	};
	const mainTarget = {
		...papi.globals(),
		lynx: { getJSContext: () => contexts.main },
	};
	const onDiagnostic = (error: Error) => diagnostics.push(error);
	const mainLayer =
		options.mainLayer?.installMainThreadLayer(mainTarget, contexts.main, onDiagnostic) ?? null;
	const main =
		mainLayer?.controller ??
		installLynxMainThread({ target: mainTarget, context: contexts.main, onDiagnostic });
	const backgroundTarget = {
		// The engine's private background event injection. Carrying it on the
		// harness target keeps each run's engine hooks off the global object.
		lynxCoreInject: { tt: {} as Record<string, unknown> },
		lynx: {
			getCoreContext: () => contexts.background,
			getJSModule: (name: string) => {
				if (name === 'GlobalEventEmitter') return emitter;
				throw new Error(`getJSModule(${name}) is not available in the benchmark host.`);
			},
			reportError: (error: unknown) => {
				diagnostics.push(error instanceof Error ? error : new Error(String(error)));
			},
		},
		queueMicrotask: (callback: () => void) => queueMicrotask(callback),
	};
	const root = createLynxRoot({
		target: backgroundTarget,
		onDiagnostic: (error) => diagnostics.push(error),
	});
	return {
		papi,
		root,
		main,
		mainLayer,
		diagnostics,
		backgroundTarget: backgroundTarget as unknown as Record<string, unknown>,
		transportMessages: contexts.messages,
		async dispose() {
			await root.unmount();
			main.close();
		},
	};
}

export function makeRows(count: number): BenchRow[] {
	const rows = new Array<BenchRow>(count);
	for (let index = 0; index < count; index++) {
		rows[index] = { id: index + 1, label: `row label ${index + 1}` };
	}
	return rows;
}

export interface RunResult {
	readonly durationMs: number;
	readonly createdElements: number;
	readonly checksum: number;
	readonly reachableChecksum: number;
	readonly eventTokens: number;
	readonly privateSelectors: number;
	readonly diagnostics: readonly string[];
	readonly transport: LynxTransportMetrics;
	/** Wire traffic inside the timed interval only. */
	readonly wire: LynxWireMetrics;
	/** Fixture component executions inside the timed interval, per thread. */
	readonly renders: { readonly background: number; readonly main: number };
	/** Element PAPI calls inside the timed interval, when the run counted them. */
	readonly papiCalls: Readonly<Record<string, number>> | null;
}

/** Messages and UTF-8 bytes each direction carried, all through the codec. */
export interface LynxWireMetrics {
	readonly framesToMain: number;
	readonly framesToBackground: number;
	readonly bytesToMain: number;
	readonly bytesToBackground: number;
}

export interface RunOptions {
	/** Count Element PAPI calls. Adds work inside the timer, so never on a timing sample. */
	readonly countCalls?: boolean;
}

export interface AdoptionResult extends RunResult {
	/** Hosts the background created while adopting a complete first screen. */
	readonly hostsCreatedDuringAdoption: number;
	/** Every first-screen host is still the reachable host at the same position. */
	readonly retainedIdentity: boolean;
	/** Visible-tree checksum of the first screen before adoption began. */
	readonly firstScreenChecksum: number;
	/** A native tap on the adopted tree reached its background handler. */
	readonly adoptedTapHandled: boolean;
}

/** Structural mount work, measured only after the wall-clock timer stops. */
export interface LynxTransportMetrics {
	readonly commands: number;
	readonly templateCommands: number;
	readonly templateNodes: number;
	readonly programCommands: number;
	readonly programRuns: number;
	readonly sharedPrograms: number;
	readonly legacyCreates: number;
	readonly acknowledgements: number;
	readonly compactAcknowledgements: number;
}

export interface ReentrantCommitResult {
	readonly durationMs: number;
	readonly acknowledgements: number;
	readonly completions: number;
	readonly finalId: string | null;
	readonly finalVersion: number | undefined;
	readonly diagnostics: readonly string[];
}

/** Drain a synchronous burst queued reentrantly during one native host update. */
export function runReentrantCommits(count: number): ReentrantCommitResult {
	if (!Number.isSafeInteger(count) || count <= 0) {
		throw new TypeError(
			`Reentrant commit count must be a positive safe integer, received ${count}.`,
		);
	}
	const contexts = createContextPair();
	const papi = new FakeElementPAPI();
	const diagnostics: Error[] = [];
	let acknowledgements = 0;
	let completions = 0;
	const main = installLynxMainThread({
		target: papi.globals(),
		context: contexts.main,
		onDiagnostic: (error) => diagnostics.push(error),
	});
	// Both directions carry the transport codec's string, exactly as the
	// production background transport sends and receives it: the receiver
	// rejects a raw object, so dispatching one would measure nothing.
	contexts.background.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
		if (typeof event.data !== 'string') {
			diagnostics.push(
				new TypeError(`Main thread replied with ${typeof event.data}, not a string.`),
			);
			return;
		}
		const type = (decodeLynxTransportValue(event.data) as { readonly type?: unknown }).type;
		if (type === 'ack') acknowledgements++;
		else if (type === 'complete') completions++;
	});
	const encodeCommit = (version: number, commands: readonly Record<string, unknown>[]): string =>
		encodeLynxTransportValue({
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			root: 1,
			version,
			type: 'commit',
			batch: { renderer: LYNX_TRANSPORT_RENDERER, version, commands },
		});
	const dispatchCommit = (data: string): void => {
		contexts.background.dispatchEvent({ type: LYNX_BACKGROUND_TO_MAIN_EVENT, data });
	};
	dispatchCommit(
		encodeCommit(1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'initial' } },
			{ op: 'insert', parent: null, id: 1, before: null },
		]),
	);
	// Encoding is the sender's cost, so the burst is encoded before the timer
	// starts and the interval stays the receiver's queue drain.
	const queued: string[] = [];
	for (let index = 0; index < count; index++) {
		queued.push(
			encodeCommit(index + 3, [{ op: 'update', id: 1, props: { id: `queued-${index}` } }]),
		);
	}
	const outer = encodeCommit(2, [{ op: 'update', id: 1, props: { id: 'outer' } }]);
	papi.onSetId = () => {
		papi.onSetId = null;
		for (const data of queued) dispatchCommit(data);
	};
	const started = performance.now();
	dispatchCommit(outer);
	const durationMs = performance.now() - started;
	const finalVersion = main.activeIdentity()?.version;
	const finalId = papi.rootChildId();
	main.close();
	return {
		durationMs,
		acknowledgements,
		completions,
		finalId,
		finalVersion,
		diagnostics: diagnostics.map((error) => error.message),
	};
}

function transportMetrics(harness: Harness): LynxTransportMetrics {
	let commands = 0;
	let templateCommands = 0;
	let templateNodes = 0;
	let programCommands = 0;
	let programRuns = 0;
	let legacyCreates = 0;
	let acknowledgements = 0;
	let compactAcknowledgements = 0;
	const sharedPrograms = new Set<object>();
	for (const event of harness.transportMessages) {
		// Decoded, not read: the transport encodes, so `event.data` is the string
		// the receiver parses. Reading it raw would count zero commands and no
		// acknowledgements while still producing a number.
		if (typeof event.data !== 'string') continue;
		const message = decodeLynxTransportValue(event.data) as {
			readonly type?: unknown;
			readonly encoding?: unknown;
			readonly batch?: {
				readonly commands?: readonly {
					readonly op?: unknown;
					readonly count?: number;
					readonly nodes?: readonly unknown[];
					readonly program?: { readonly nodes?: readonly unknown[] };
				}[];
			};
		};
		if (message.type === 'ack') {
			acknowledgements++;
			if (message.encoding === 'compact-v1') compactAcknowledgements++;
		} else if (message.type === 'commit') {
			for (const command of message.batch?.commands ?? []) {
				commands++;
				if (command.op === 'create') legacyCreates++;
				else if (command.op === 'mount-template') {
					templateCommands++;
					templateNodes += command.nodes?.length ?? 0;
				} else if (command.op === 'mount-template-range') {
					templateCommands++;
					programCommands++;
					templateNodes += command.program?.nodes?.length ?? 0;
					if (command.program !== undefined) sharedPrograms.add(command.program);
				} else if (command.op === 'mount-template-run') {
					const count = command.count ?? 0;
					templateCommands += count;
					programCommands += count;
					programRuns++;
					templateNodes += count * (command.program?.nodes?.length ?? 0);
					if (command.program !== undefined) sharedPrograms.add(command.program);
				}
			}
		}
	}
	return {
		commands,
		templateCommands,
		templateNodes,
		programCommands,
		programRuns,
		sharedPrograms: sharedPrograms.size,
		legacyCreates,
		acknowledgements,
		compactAcknowledgements,
	};
}

async function settle(harness: Harness): Promise<void> {
	await harness.root.flushTransport();
	for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

const utf8 = new TextEncoder();

function wireMetrics(messages: readonly LynxContextProxyEvent[]): LynxWireMetrics {
	let framesToMain = 0;
	let framesToBackground = 0;
	let bytesToMain = 0;
	let bytesToBackground = 0;
	for (const event of messages) {
		const bytes = typeof event.data === 'string' ? utf8.encode(event.data).length : 0;
		if (event.type === LYNX_BACKGROUND_TO_MAIN_EVENT) {
			framesToMain++;
			bytesToMain += bytes;
		} else if (event.type === LYNX_MAIN_TO_BACKGROUND_EVENT) {
			framesToBackground++;
			bytesToBackground += bytes;
		}
	}
	return { framesToMain, framesToBackground, bytesToMain, bytesToBackground };
}

/**
 * Work counters for one timed interval. `start()` runs just before the timer and
 * every read happens after it stops, so no counter is maintained inside it
 * beyond the opt-in Element PAPI call counts.
 */
function intervalCounters(harness: Harness, main: MainThreadLayerBundle | undefined) {
	let messageMark = 0;
	let backgroundRenders = 0;
	let mainRenders = 0;
	return {
		start() {
			messageMark = harness.transportMessages.length;
			backgroundRenders = renderCounts.app;
			mainRenders = main?.mainRenderCount() ?? 0;
			harness.papi.calls?.clear();
		},
		finish(durationMs: number): RunResult {
			return {
				durationMs,
				createdElements: harness.papi.createdElements,
				checksum: harness.papi.checksum(),
				reachableChecksum: harness.papi.reachableChecksum(),
				eventTokens: harness.papi.eventTokens().length,
				privateSelectors: harness.papi.privateRefSelectors(),
				diagnostics: harness.diagnostics.map((error) => error.message),
				transport: transportMetrics(harness),
				wire: wireMetrics(harness.transportMessages.slice(messageMark)),
				renders: {
					background: renderCounts.app - backgroundRenders,
					main: (main?.mainRenderCount() ?? 0) - mainRenders,
				},
				papiCalls: harness.papi.calls === null ? null : Object.fromEntries(harness.papi.calls),
			};
		},
	};
}

/** Empty-startup target: root construction, readiness, and one empty commit. */
export async function runEmptyStartup(options: RunOptions = {}): Promise<RunResult> {
	const harness = createHarness(options);
	const counters = intervalCounters(harness, undefined);
	counters.start();
	const started = performance.now();
	await harness.root.render(EmptyApp, {});
	await settle(harness);
	const result = counters.finish(performance.now() - started);
	await harness.dispose();
	return result;
}

/** Create-rows target: one mount of `count` keyed rows through the full path. */
export async function runCreateRows(count: number, options: RunOptions = {}): Promise<RunResult> {
	const harness = createHarness(options);
	const rows = makeRows(count);
	const counters = intervalCounters(harness, undefined);
	counters.start();
	const started = performance.now();
	await harness.root.render(BenchApp, { rows });
	await settle(harness);
	const result = counters.finish(performance.now() - started);
	await harness.dispose();
	return result;
}

function publishTap(harness: Harness, token: string, row: number, timestamp: number): void {
	const publishEvent = (
		harness.backgroundTarget as { lynxCoreInject?: { tt?: { publishEvent?: unknown } } }
	).lynxCoreInject?.tt?.publishEvent as ((handler: unknown, event: unknown) => unknown) | undefined;
	if (typeof publishEvent !== 'function') {
		throw new Error('Octane Lynx benchmark requires the background publishEvent receiver.');
	}
	publishEvent(token, {
		type: 'tap',
		timestamp,
		target: { id: `row-${row}`, uid: row, dataset: {} },
		currentTarget: { id: `row-${row}`, uid: row, dataset: {} },
	});
}

/** Time the first native selection after an already-settled keyed-row mount. */
export async function runUpdateRows(count: number, options: RunOptions = {}): Promise<RunResult> {
	const harness = createHarness(options);
	await harness.root.render(BenchApp, { rows: makeRows(count) });
	await settle(harness);
	const token = harness.papi.eventTokens()[0];
	if (token === undefined) {
		await harness.dispose();
		throw new Error('Octane Lynx update benchmark requires a mounted native tap handler.');
	}
	const counters = intervalCounters(harness, undefined);
	counters.start();
	const started = performance.now();
	publishTap(harness, token, 1, 1);
	await settle(harness);
	const result = counters.finish(performance.now() - started);
	await harness.dispose();
	return result;
}

/**
 * First-screen target: the main thread's synchronous paint of `count` keyed
 * rows with its own specialization of the fixture, through to the release of
 * the readiness handshake Rspeedy performs right after the main entry runs.
 */
export async function runFirstScreen(
	count: number,
	main: MainThreadLayerBundle,
	options: RunOptions = {},
): Promise<RunResult> {
	const harness = createHarness({ ...options, mainLayer: main });
	const rows = makeRows(count);
	const counters = intervalCounters(harness, main);
	counters.start();
	const started = performance.now();
	harness.mainLayer!.renderFirstScreen(rows);
	harness.main.markFirstScreenSyncReady();
	const result = counters.finish(performance.now() - started);
	await harness.dispose();
	return result;
}

/**
 * Adoption target: after an untimed first screen, the background's first
 * render of the same rows through acknowledgement, which must take over the
 * painted hosts instead of creating new ones. One native tap afterwards, also
 * untimed, proves the adopted tree routes events to background handlers.
 */
export async function runAdoption(
	count: number,
	main: MainThreadLayerBundle,
	options: RunOptions = {},
): Promise<AdoptionResult> {
	const harness = createHarness({ ...options, mainLayer: main });
	const rows = makeRows(count);
	harness.mainLayer!.renderFirstScreen(rows);
	harness.main.markFirstScreenSyncReady();
	const firstScreenNodes = harness.papi.reachableNodes();
	const firstScreenChecksum = harness.papi.reachableChecksum();
	const createdBefore = harness.papi.createdElements;
	const counters = intervalCounters(harness, main);
	counters.start();
	const started = performance.now();
	await harness.root.render(BenchApp, { rows });
	await settle(harness);
	const result = counters.finish(performance.now() - started);
	const adoptedNodes = harness.papi.reachableNodes();
	const retainedIdentity =
		adoptedNodes.length === firstScreenNodes.length &&
		adoptedNodes.every((node, index) => node === firstScreenNodes[index]);
	const token = harness.papi.eventTokens()[0];
	let adoptedTapHandled = false;
	if (token !== undefined) {
		publishTap(harness, token, 1, 1);
		await settle(harness);
		adoptedTapHandled = harness.papi.reachableChecksum() !== result.reachableChecksum;
	}
	const diagnostics = harness.diagnostics.map((error) => error.message);
	await harness.dispose();
	return {
		...result,
		diagnostics,
		hostsCreatedDuringAdoption: result.createdElements - createdBefore,
		retainedIdentity,
		firstScreenChecksum,
		adoptedTapHandled,
	};
}

/**
 * Mount without tearing down, so a CPU profile of this function attributes
 * only the work the create-rows timing actually measures.
 */
export async function mountRows(count: number): Promise<Harness> {
	const harness = createHarness();
	await harness.root.render(BenchApp, { rows: makeRows(count) });
	await settle(harness);
	return harness;
}

export interface ClickResult {
	readonly tokens: number;
	readonly engineHookInstalled: boolean;
	readonly handled: boolean;
	readonly reachableChecksumBefore: number;
	readonly reachableChecksumAfter: number;
	readonly reachableChecksums: readonly number[];
	readonly diagnostics: readonly string[];
}

/**
 * Click target: mount rows, then deliver one native tap through the same
 * receiver the engine drives, proving the event path reaches the background
 * handler and re-renders.
 */
export async function runClick(count: number): Promise<ClickResult> {
	const harness = createHarness();
	const rows = makeRows(count);
	await harness.root.render(BenchApp, { rows });
	await settle(harness);
	const tokens = harness.papi.eventTokens();
	const before = harness.papi.reachableChecksum();
	// Drive the engine's own delivery: resolve the installed token through
	// `lynxCoreInject.tt.publishEvent`, exactly as a native tap does.
	const engine = (harness.backgroundTarget as { lynxCoreInject?: { tt?: Record<string, unknown> } })
		.lynxCoreInject?.tt;
	const publishEvent = engine?.publishEvent as
		((handler: unknown, event: unknown) => unknown) | undefined;
	const reachableChecksums = [before];
	if (tokens.length >= 3 && typeof publishEvent === 'function') {
		for (let index = 0; index < 3; index++) {
			const row = index < 2 ? 1 : 2;
			publishEvent(tokens[index]!, {
				type: 'tap',
				timestamp: index + 1,
				target: { id: `row-${row}`, uid: row, dataset: {} },
				currentTarget: { id: `row-${row}`, uid: row, dataset: {} },
			});
			await settle(harness);
			reachableChecksums.push(harness.papi.reachableChecksum());
		}
	}
	const after = harness.papi.reachableChecksum();
	const result: ClickResult = {
		tokens: tokens.length,
		engineHookInstalled: typeof publishEvent === 'function',
		handled:
			reachableChecksums.length === 4 &&
			reachableChecksums.every(
				(value, index) => index === 0 || value !== reachableChecksums[index - 1],
			),
		reachableChecksumBefore: before,
		reachableChecksumAfter: after,
		reachableChecksums,
		diagnostics: harness.diagnostics.map((error) => error.message),
	};
	await harness.dispose();
	return result;
}
