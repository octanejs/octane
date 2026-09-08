import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';
import {
	defineUniversalComponent,
	universalPlan,
	universalProps,
	universalValue,
} from 'octane/universal/native';
import { afterEach, describe, expect, it } from 'vitest';

import { createLynxRoot, type LynxRoot } from '../src/index.js';
import { installLynxMainThread, type LynxMainThreadController } from '../src/main-thread.js';
import type { LynxContextProxy, LynxContextProxyEvent } from '../src/core/protocol.js';
import { conformingContextProxy, unwire } from './_fixtures/lynx-wire.js';

const LYNX_SRC = fileURLToPath(new URL('../src', import.meta.url));

/** Every `.ts` under `src`, so a new send site cannot hide in a new file. */
function sourceFiles(directory: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) found.push(...sourceFiles(path));
		else if (entry.name.endsWith('.ts')) found.push(path);
	}
	return found.sort();
}

/** The `{ … }` immediately after each `dispatchEvent(`, brace-matched. */
function dispatchEventArguments(source: string): string[] {
	const found: string[] = [];
	const pattern = /\bdispatchEvent\(\s*\{/g;
	for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
		let depth = 0;
		let index = source.indexOf('{', match.index);
		const start = index;
		while (index < source.length) {
			const character = source[index];
			if (character === '{') depth++;
			else if (character === '}') {
				depth--;
				if (depth === 0) break;
			}
			index++;
		}
		found.push(source.slice(start, index + 1));
	}
	return found;
}

describe('Lynx transport conformance', () => {
	// The static half. A runtime probe only proves what it executed, and the
	// claim being made is about every path, so the send sites are counted and
	// read directly. Adding a fifth one, or dropping the encode from an existing
	// one, is what this notices.
	it('encodes at every send site in the package, and there are exactly four', () => {
		const sites: string[] = [];
		for (const file of sourceFiles(LYNX_SRC)) {
			const source = readFileSync(file, 'utf8');
			for (const argument of dispatchEventArguments(source)) {
				// Only the two transport channels; a host PAPI dispatch is not ours.
				if (!/LYNX_(?:MAIN_TO_BACKGROUND|BACKGROUND_TO_MAIN)_EVENT/.test(argument)) continue;
				sites.push(`${relative(LYNX_SRC, file)}: ${argument.replace(/\s+/g, ' ')}`);
			}
		}
		expect(sites).toHaveLength(4);
		for (const site of sites) {
			expect(site).toMatch(/data:\s*encoded\b|data:\s*encodeLynxTransportValue\(/);
		}
	});

	// The receiving half of the same claim. `event.data` is whatever the other
	// side handed across — a peer thread's encoded string, or, at the engine
	// lifecycle entries, a value nobody encoded at all. Either way it is the one
	// expression in the package that may be a host-backed reference, so reading
	// it anywhere except as the argument to a materializer is the defect.
	it('reads event.data only through a materializer, at every receive site', () => {
		const reads: string[] = [];
		for (const file of sourceFiles(LYNX_SRC)) {
			for (const line of readFileSync(file, 'utf8').split('\n')) {
				// Prose about the boundary is not a read of it. Comment lines are
				// dropped whole, which leaves a trailing comment on a code line
				// scanned — the conservative direction for a rule like this.
				const code = line.trimStart();
				if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) continue;
				const pattern = /\bevent\.data\b/g;
				for (let match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
					reads.push(`${relative(LYNX_SRC, file)}: ${line.slice(0, match.index).trimEnd()}`);
				}
			}
		}
		expect(reads).toHaveLength(4);
		for (const read of reads) {
			expect(read).toMatch(/(?:decodeLynxTransportValue|localizeLynxHostValue)\($/);
		}
	});

	// The dynamic half, under traffic the static half cannot see: what a real
	// mount, update, and teardown actually put on the channel.
	describe('under a strict wire', () => {
		let root: LynxRoot | null = null;
		let main: LynxMainThreadController | null = null;
		let dom: JSDOM | null = null;

		afterEach(async () => {
			globalThis.lynxTestingEnv?.switchToBackgroundThread();
			await root?.unmount().catch(() => {});
			root = null;
			globalThis.lynxTestingEnv?.switchToMainThread();
			main?.close();
			main = null;
			globalThis.lynxTestingEnv?.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom?.window.close();
			dom = null;
		});

		it('carries only decodable strings across a real mount, update, and teardown', async () => {
			dom = new JSDOM('<!doctype html><html><body></body></html>');
			installLynxTestingEnv(globalThis, {
				window: dom.window as unknown as Window & typeof globalThis,
			});
			const env = globalThis.lynxTestingEnv;

			env.switchToMainThread();
			const mainWire = conformingContextProxy(
				(
					globalThis as unknown as { lynx: { getJSContext(): LynxContextProxy } }
				).lynx.getJSContext(),
			);
			main = installLynxMainThread({ context: mainWire.context });

			env.switchToBackgroundThread();
			const backgroundWire = conformingContextProxy(
				(
					globalThis as unknown as { lynx: { getJSContext(): LynxContextProxy } }
				).lynx.getJSContext(),
			);
			root = createLynxRoot({ context: backgroundWire.context });

			const plan = universalPlan('lynx', { kind: 'host', type: 'view', propsSlot: 0 });
			const Scene = defineUniversalComponent('lynx', (props: { readonly id: string }) =>
				universalValue(plan, [universalProps([['set', 'id', props.id]])]),
			);

			await root.render(Scene, { id: 'mounted' });
			await root.flushTransport();
			expect(dom.window.document.querySelector('#mounted')).not.toBeNull();

			await root.render(Scene, { id: 'updated' });
			await root.flushTransport();
			expect(dom.window.document.querySelector('#updated')).not.toBeNull();

			await root.unmount();
			root = null;

			// The positive control. A wrapper that was never reached would satisfy
			// every assertion above it, which is exactly how a conformance harness
			// quietly stops proving anything.
			expect(backgroundWire.conformance.crossings.length).toBeGreaterThan(0);
			expect(mainWire.conformance.crossings.length).toBeGreaterThan(0);
			// Both directions were exercised, not just the loud one.
			expect(backgroundWire.conformance.bytes()).toBeGreaterThan(0);
			expect(mainWire.conformance.bytes()).toBeGreaterThan(0);
		});

		// The engine lifecycle entry is the one inbound path whose sender is the
		// native engine rather than Octane's own transport, so it is the one place
		// a value arrives unencoded. What it produces still has to leave on the
		// same strict wire as everything else, which is what this drives.
		it('carries what the engine handed in out across the same strict wire', async () => {
			dom = new JSDOM('<!doctype html><html><body></body></html>');
			installLynxTestingEnv(globalThis, {
				window: dom.window as unknown as Window & typeof globalThis,
			});
			const env = globalThis.lynxTestingEnv;

			env.switchToMainThread();
			const engineListeners = new Map<string, Set<(event: LynxContextProxyEvent) => void>>();
			const engine: LynxContextProxy = {
				dispatchEvent(event: LynxContextProxyEvent): unknown {
					for (const listener of [...(engineListeners.get(event.type) ?? [])]) listener(event);
					return undefined;
				},
				addEventListener(type: string, listener: (event: LynxContextProxyEvent) => void): void {
					let entries = engineListeners.get(type);
					if (entries === undefined) engineListeners.set(type, (entries = new Set()));
					entries.add(listener);
				},
				removeEventListener(type: string, listener: (event: LynxContextProxyEvent) => void): void {
					engineListeners.get(type)?.delete(listener);
				},
			};
			const mainThreadLynx = (
				globalThis as unknown as {
					lynx: { getJSContext(): LynxContextProxy; getEngine?: () => LynxContextProxy };
				}
			).lynx;
			// Read during install, so it has to be in place before the controller.
			mainThreadLynx.getEngine = () => engine;
			const mainWire = conformingContextProxy(mainThreadLynx.getJSContext());
			main = installLynxMainThread({ context: mainWire.context });

			env.switchToBackgroundThread();
			const backgroundWire = conformingContextProxy(
				(
					globalThis as unknown as { lynx: { getJSContext(): LynxContextProxy } }
				).lynx.getJSContext(),
			);
			root = createLynxRoot({ context: backgroundWire.context });

			const plan = universalPlan('lynx', { kind: 'host', type: 'view', propsSlot: 0 });
			const Scene = defineUniversalComponent('lynx', (props: { readonly id: string }) =>
				universalValue(plan, [universalProps([['set', 'id', props.id]])]),
			);
			// Lifecycle records queue until the threads have correlated, so a real
			// mount is what lets them reach the wire at all.
			await root.render(Scene, { id: 'lifecycle-host' });
			await root.flushTransport();

			env.switchToMainThread();
			engine.dispatchEvent({
				type: '__RenderPage',
				data: [{ profile: { name: 'Ada' } }, { initPage: true }],
			});
			engine.dispatchEvent({ type: '__UpdateGlobalProps', data: [{ theme: 'dark' }] });

			const delivered = mainWire.conformance.crossings.map(
				(payload) => unwire(payload) as { readonly type?: unknown },
			);
			expect(delivered.filter((message) => message.type === 'page-data')).toEqual([
				expect.objectContaining({ operation: 'replace', data: { profile: { name: 'Ada' } } }),
			]);
			expect(delivered.filter((message) => message.type === 'global-props')).toEqual([
				expect.objectContaining({ patch: { theme: 'dark' } }),
			]);
		});
	});
});
