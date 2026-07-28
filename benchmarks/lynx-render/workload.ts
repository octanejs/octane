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
import type { LynxElementEventListener } from '../../packages/lynx/src/core/papi.js';
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
			const list = other.get(event.type);
			if (list === undefined) return;
			for (const listener of list.slice()) listener(event);
		},
	});
	return {
		background: end(backgroundListeners, mainListeners),
		main: end(mainListeners, backgroundListeners),
	};
}

export class FakeElementPAPI {
	private nextSign = 1;
	readonly nodes = new Map<number, FakeNode>();
	flushes = 0;
	createdElements = 0;

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
}

export interface Harness {
	readonly papi: FakeElementPAPI;
	readonly root: LynxRoot;
	readonly main: ReturnType<typeof installLynxMainThread>;
	readonly diagnostics: Error[];
	/** Background globals, including the engine's `lynxCoreInject.tt` hook. */
	readonly backgroundTarget: Record<string, unknown>;
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
	readonly diagnostics: readonly string[];
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
		diagnostics: harness.diagnostics.map((error) => error.message),
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
		diagnostics: harness.diagnostics.map((error) => error.message),
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
	const before = harness.papi.checksum();
	// Drive the engine's own delivery: resolve the installed token through
	// `lynxCoreInject.tt.publishEvent`, exactly as a native tap does.
	const engine = (harness.backgroundTarget as { lynxCoreInject?: { tt?: Record<string, unknown> } })
		.lynxCoreInject?.tt;
	const publishEvent = engine?.publishEvent as
		((handler: unknown, event: unknown) => unknown) | undefined;
	if (tokens.length !== 0 && typeof publishEvent === 'function') {
		publishEvent(tokens[0]!, {
			type: 'tap',
			timestamp: 1,
			target: { id: 'row-1', uid: 1, dataset: {} },
			currentTarget: { id: 'row-1', uid: 1, dataset: {} },
		});
		await settle(harness);
	}
	const handled = harness.papi.checksum() !== before;
	const result: ClickResult = {
		tokens: tokens.length,
		engineHookInstalled: typeof publishEvent === 'function',
		handled,
		diagnostics: harness.diagnostics.map((error) => error.message),
	};
	await harness.dispose();
	return result;
}
