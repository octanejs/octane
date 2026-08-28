/**
 * Timing workload for the real Octane Lynx dual-thread path.
 *
 * It drives the production background root, the production async transport,
 * and the production main-thread receiver/host driver over an in-process
 * ContextProxy pair, with a minimal fake Element PAPI standing in for the
 * native engine. The fake PAPI is deliberately cheap so the measurement is
 * Octane's own per-node CPU cost rather than native element allocation. This
 * makes no native paint, layout, or device claim.
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
import { decodeLynxTransportValue } from '../../packages/lynx/src/core/transport-codec.js';
import { BenchApp, EmptyApp, type BenchRow } from './src/App.lynx.tsrx';

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
function createContextPair(): ContextPair {
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
}

export interface Harness {
	readonly papi: FakeElementPAPI;
	readonly root: LynxRoot;
	readonly main: ReturnType<typeof installLynxMainThread>;
	readonly diagnostics: Error[];
	/** Background globals, including the engine's `lynxCoreInject.tt` hook. */
	readonly backgroundTarget: Record<string, unknown>;
	/** Frozen wire messages, retained solely for post-timing structural checks. */
	readonly transportMessages: readonly LynxContextProxyEvent[];
	dispose(): Promise<void>;
}

export function createHarness(): Harness {
	const contexts = createContextPair();
	const papi = new FakeElementPAPI();
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
	const main = installLynxMainThread({
		target: mainTarget,
		context: contexts.main,
		onDiagnostic: (error) => diagnostics.push(error),
	});
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
	contexts.background.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
		const type = (event.data as { readonly type?: unknown }).type;
		if (type === 'ack') acknowledgements++;
		else if (type === 'complete') completions++;
	});
	const dispatchCommit = (version: number, commands: readonly Record<string, unknown>[]): void => {
		contexts.background.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 1,
				version,
				type: 'commit',
				batch: { renderer: LYNX_TRANSPORT_RENDERER, version, commands },
			},
		});
	};
	dispatchCommit(1, [
		{ op: 'create', id: 1, type: 'view', props: { id: 'initial' } },
		{ op: 'insert', parent: null, id: 1, before: null },
	]);
	papi.onSetId = () => {
		papi.onSetId = null;
		for (let index = 0; index < count; index++) {
			dispatchCommit(index + 3, [{ op: 'update', id: 1, props: { id: `queued-${index}` } }]);
		}
	};
	const started = performance.now();
	dispatchCommit(2, [{ op: 'update', id: 1, props: { id: 'outer' } }]);
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

/** Empty-startup target: root construction, readiness, and one empty commit. */
export async function runEmptyStartup(): Promise<RunResult> {
	const harness = createHarness();
	const started = performance.now();
	await harness.root.render(EmptyApp, {});
	await settle(harness);
	const durationMs = performance.now() - started;
	const result: RunResult = {
		durationMs,
		createdElements: harness.papi.createdElements,
		checksum: harness.papi.checksum(),
		reachableChecksum: harness.papi.reachableChecksum(),
		eventTokens: harness.papi.eventTokens().length,
		privateSelectors: harness.papi.privateRefSelectors(),
		diagnostics: harness.diagnostics.map((error) => error.message),
		transport: transportMetrics(harness),
	};
	await harness.dispose();
	return result;
}

/** Create-rows target: one mount of `count` keyed rows through the full path. */
export async function runCreateRows(count: number): Promise<RunResult> {
	const harness = createHarness();
	const rows = makeRows(count);
	const started = performance.now();
	await harness.root.render(BenchApp, { rows });
	await settle(harness);
	const durationMs = performance.now() - started;
	const result: RunResult = {
		durationMs,
		createdElements: harness.papi.createdElements,
		checksum: harness.papi.checksum(),
		reachableChecksum: harness.papi.reachableChecksum(),
		eventTokens: harness.papi.eventTokens().length,
		privateSelectors: harness.papi.privateRefSelectors(),
		diagnostics: harness.diagnostics.map((error) => error.message),
		transport: transportMetrics(harness),
	};
	await harness.dispose();
	return result;
}

/** Time the first native selection after an already-settled keyed-row mount. */
export async function runUpdateRows(count: number): Promise<RunResult> {
	const harness = createHarness();
	await harness.root.render(BenchApp, { rows: makeRows(count) });
	await settle(harness);
	const token = harness.papi.eventTokens()[0];
	const publishEvent = (
		harness.backgroundTarget as { lynxCoreInject?: { tt?: { publishEvent?: unknown } } }
	).lynxCoreInject?.tt?.publishEvent as ((handler: unknown, event: unknown) => unknown) | undefined;
	if (token === undefined || typeof publishEvent !== 'function') {
		await harness.dispose();
		throw new Error('Octane Lynx update benchmark requires a mounted native tap handler.');
	}
	const started = performance.now();
	publishEvent(token, {
		type: 'tap',
		timestamp: 1,
		target: { id: 'row-1', uid: 1, dataset: {} },
		currentTarget: { id: 'row-1', uid: 1, dataset: {} },
	});
	await settle(harness);
	const durationMs = performance.now() - started;
	const result: RunResult = {
		durationMs,
		createdElements: harness.papi.createdElements,
		checksum: harness.papi.checksum(),
		reachableChecksum: harness.papi.reachableChecksum(),
		eventTokens: harness.papi.eventTokens().length,
		privateSelectors: harness.papi.privateRefSelectors(),
		diagnostics: harness.diagnostics.map((error) => error.message),
		transport: transportMetrics(harness),
	};
	await harness.dispose();
	return result;
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
