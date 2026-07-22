import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';
import type { UniversalComponent } from 'octane/universal/native';
import { afterEach, describe, expect, it } from 'vitest';
import { createLynxRoot, type LynxPublicHandle, type LynxRoot } from '../src/index.js';
import { installLynxMainThread, type LynxMainThreadController } from '../src/main-thread.js';
import {
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	type LynxContextProxy,
	type LynxContextProxyEvent,
} from '../src/core/protocol.js';
import { NativeListLifecycleFixture } from './_fixtures/native-list-lifecycle.lynx.tsrx';
import { NativeListFixture } from './_fixtures/native-list.lynx.tsrx';

interface NativeListItem {
	readonly id: string;
	readonly label: string;
}

interface NativeListProps {
	readonly items: readonly NativeListItem[];
	readonly captureRef: (id: string, handle: LynxPublicHandle | null) => void;
	readonly onTap: (id: string) => void;
}

interface NativeEventRegistration {
	readonly name: string;
	readonly listener: string | undefined;
}

const fixture = NativeListFixture as UniversalComponent<NativeListProps>;
const lifecycleFixture = NativeListLifecycleFixture as UniversalComponent<{
	readonly items: readonly NativeListItem[];
	readonly captureIncrement: (id: string, increment: () => void) => void;
	readonly log: (entry: string) => void;
}>;
let root: LynxRoot | null = null;
let main: LynxMainThreadController | null = null;
let dom: JSDOM | null = null;

afterEach(async () => {
	if (root !== null) {
		try {
			await root.unmount();
		} catch {
			// A failed assertion can leave a root already terminally disposed.
		}
	}
	root = null;
	main?.close();
	main = null;
	if (dom !== null) {
		globalThis.lynxTestingEnv.clearGlobal();
		uninstallLynxTestingEnv(globalThis);
		dom.window.close();
		dom = null;
	}
});

describe.sequential('Lynx recycled list background integration', () => {
	it('retains logical state and effects while recycling a physical cell', async () => {
		dom = new JSDOM('<!doctype html><html><body></body></html>');
		installLynxTestingEnv(globalThis, { window: dom.window as never });
		const environment = globalThis.lynxTestingEnv;
		environment.switchToMainThread();
		main = installLynxMainThread();
		environment.switchToBackgroundThread();

		const lifecycleLog: string[] = [];
		const increments = new Map<string, () => void>();
		const captureIncrement = (id: string, next: () => void) => {
			increments.set(id, next);
		};
		const log = (entry: string) => {
			lifecycleLog.push(entry);
		};
		root = createLynxRoot();
		await root.render(lifecycleFixture, {
			items: [
				{ id: 'retained', label: 'Retained' },
				{ id: 'replacement', label: 'Replacement' },
			],
			captureIncrement,
			log,
		});
		await root.flushTransport();

		const list = dom.window.document.querySelector('#stateful-feed')!;
		expect(list.children).toHaveLength(0);
		environment.switchToMainThread();
		const firstSign = globalThis.elementTree.enterListItemAtIndex(list as never, 0);
		expect(list.firstElementChild?.textContent).toBe('Retained: 0');

		environment.switchToBackgroundThread();
		await root.flushTransport();
		expect(lifecycleLog.filter((entry) => entry === 'effect:retained')).toHaveLength(1);
		const increment = increments.get('retained');
		if (increment === undefined) throw new Error('Expected the retained list item action.');
		increment();
		await root.flushTransport();

		environment.switchToMainThread();
		expect(list.firstElementChild?.textContent).toBe('Retained: 1');
		globalThis.elementTree.leaveListItem(list as never, firstSign);
		expect(globalThis.elementTree.enterListItemAtIndex(list as never, 1)).toBe(firstSign);
		expect(list.firstElementChild?.textContent).toBe('Replacement: 0');
		expect(lifecycleLog.filter((entry) => entry === 'cleanup:retained')).toHaveLength(0);
		globalThis.elementTree.leaveListItem(list as never, firstSign);
		expect(globalThis.elementTree.enterListItemAtIndex(list as never, 0)).toBe(firstSign);
		expect(list.firstElementChild?.textContent).toBe('Retained: 1');
		expect(lifecycleLog.filter((entry) => entry === 'effect:retained')).toHaveLength(1);

		environment.switchToBackgroundThread();
		await root.render(lifecycleFixture, {
			items: [{ id: 'replacement', label: 'Replacement' }],
			captureIncrement,
			log,
		});
		await root.flushTransport();
		expect(lifecycleLog.filter((entry) => entry === 'cleanup:retained')).toHaveLength(1);

		await root.unmount();
		root = null;
		expect(lifecycleLog.filter((entry) => entry === 'cleanup:retained')).toHaveLength(1);
	});

	it('keeps cells lazy and rebinds native identity, events, and refs across reuse', async () => {
		dom = new JSDOM('<!doctype html><html><body></body></html>');
		installLynxTestingEnv(globalThis, { window: dom.window as never });
		const environment = globalThis.lynxTestingEnv;
		environment.switchToMainThread();
		const target = globalThis as unknown as Record<string, unknown>;
		const registrations: NativeEventRegistration[] = [];
		const addEvent = target.__AddEvent as (
			node: object,
			kind: string,
			name: string,
			listener: string | undefined,
		) => void;
		target.__AddEvent = (node, kind, name, listener) => {
			registrations.push({ name, listener });
			addEvent(node, kind, name, listener);
		};
		main = installLynxMainThread();
		environment.switchToBackgroundThread();

		const refLog: string[] = [];
		const tapLog: string[] = [];
		const items = Array.from({ length: 1_000 }, (_, index) => ({
			id: String(index),
			label: `Row ${index}`,
		}));
		root = createLynxRoot();
		await root.render(fixture, {
			items,
			captureRef(id, handle) {
				refLog.push(`${id}:${handle === null ? 'detach' : 'attach'}`);
			},
			onTap(id) {
				tapLog.push(id);
			},
		});

		const list = dom.window.document.querySelector('#native-feed')!;
		expect(list.children).toHaveLength(0);
		expect(refLog).toEqual([]);

		environment.switchToMainThread();
		const firstSign = globalThis.elementTree.enterListItemAtIndex(list as never, 0);
		const firstCell = list.firstElementChild!;
		expect(firstCell.textContent).toBe('Row 0');
		expect(refLog).toEqual(['0:attach']);
		const firstToken = registrations.findLast(
			(entry) => entry.name === 'tap' && entry.listener !== undefined,
		)?.listener;
		if (firstToken === undefined) throw new Error('Expected the first recycled cell event token.');
		main.dispatchNativeEvent(firstToken, { type: 'tap', detail: { row: 0 } });
		expect(tapLog).toEqual(['0']);

		globalThis.elementTree.leaveListItem(list as never, firstSign);
		expect(refLog).toEqual(['0:attach', '0:detach']);
		main.dispatchNativeEvent(firstToken, { type: 'tap', detail: { stale: true } });
		expect(tapLog).toEqual(['0']);

		const secondSign = globalThis.elementTree.enterListItemAtIndex(list as never, 1);
		expect(secondSign).toBe(firstSign);
		expect(list.firstElementChild).toBe(firstCell);
		expect(firstCell.textContent).toBe('Row 1');
		expect(refLog).toEqual(['0:attach', '0:detach', '1:attach']);
		const secondToken = registrations.findLast(
			(entry) => entry.name === 'tap' && entry.listener !== undefined,
		)?.listener;
		if (secondToken === undefined)
			throw new Error('Expected the rebound recycled cell event token.');
		expect(secondToken).not.toBe(firstToken);
		main.dispatchNativeEvent(secondToken, { type: 'tap', detail: { row: 1 } });
		expect(tapLog).toEqual(['0', '1']);

		environment.switchToBackgroundThread();
		await root.unmount();
		root = null;
		expect(refLog).toEqual(['0:attach', '0:detach', '1:attach', '1:detach']);
		expect(dom.window.document.querySelector('page')?.children).toHaveLength(0);
	});

	it('terminally disposes an accepted root when a scroll-time PAPI callback faults', async () => {
		dom = new JSDOM('<!doctype html><html><body></body></html>');
		installLynxTestingEnv(globalThis, { window: dom.window as never });
		const environment = globalThis.lynxTestingEnv;
		environment.switchToMainThread();
		const target = globalThis as unknown as Record<string, unknown>;
		const flush = target.__FlushElementTree as (
			node?: object,
			options?: Readonly<Record<string, unknown>>,
		) => void;
		const failure = new Error('injected accepted scroll callback failure');
		let failNextFlush = false;
		target.__FlushElementTree = (node?: object, options?: Readonly<Record<string, unknown>>) => {
			if (failNextFlush) {
				failNextFlush = false;
				throw failure;
			}
			flush(node, options);
		};
		main = installLynxMainThread();
		environment.switchToBackgroundThread();
		const refLog: string[] = [];
		const props: NativeListProps = {
			items: [{ id: '0', label: 'Row 0' }],
			captureRef(id, handle) {
				refLog.push(`${id}:${handle === null ? 'detach' : 'attach'}`);
			},
			onTap() {},
		};
		root = createLynxRoot();
		await root.render(fixture, props);
		const list = dom.window.document.querySelector('#native-feed')!;

		environment.switchToMainThread();
		expect(globalThis.elementTree.enterListItemAtIndex(list as never, 0)).toBeGreaterThan(0);
		expect(refLog).toEqual(['0:attach']);
		failNextFlush = true;
		expect(globalThis.elementTree.enterListItemAtIndex(list as never, 0)).toBe(-1);
		expect(refLog).toEqual(['0:attach', '0:detach']);
		expect(main.activeIdentity()).toBeNull();
		expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
		expect(main.diagnostics()).toContain(failure);

		environment.switchToBackgroundThread();
		await expect(root.render(fixture, props)).rejects.toThrow(failure.message);
	});

	it('terminally disposes when an accepted attachment message cannot be delivered', async () => {
		dom = new JSDOM('<!doctype html><html><body></body></html>');
		installLynxTestingEnv(globalThis, { window: dom.window as never });
		const environment = globalThis.lynxTestingEnv;
		environment.switchToMainThread();
		const target = globalThis as unknown as Record<string, unknown>;
		const context = (
			target as {
				lynx: { getJSContext(): LynxContextProxy };
			}
		).lynx.getJSContext();
		const failure = new Error('injected host attachment delivery failure');
		let failNextAttachment = false;
		const wrappedContext: LynxContextProxy = {
			dispatchEvent(event: LynxContextProxyEvent) {
				if (
					failNextAttachment &&
					event.type === LYNX_MAIN_TO_BACKGROUND_EVENT &&
					(event.data as { readonly type?: unknown }).type === 'host-attachment'
				) {
					failNextAttachment = false;
					throw failure;
				}
				return context.dispatchEvent(event);
			},
			addEventListener(type, listener) {
				context.addEventListener(type, listener);
			},
			removeEventListener(type, listener) {
				context.removeEventListener(type, listener);
			},
		};
		main = installLynxMainThread({ context: wrappedContext });
		environment.switchToBackgroundThread();
		const props: NativeListProps = {
			items: [{ id: '0', label: 'Row 0' }],
			captureRef() {},
			onTap() {},
		};
		root = createLynxRoot();
		await root.render(fixture, props);
		const list = dom.window.document.querySelector('#native-feed')!;

		environment.switchToMainThread();
		failNextAttachment = true;
		expect(globalThis.elementTree.enterListItemAtIndex(list as never, 0)).toBe(-1);
		expect(main.activeIdentity()).toBeNull();
		expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
		expect(main.diagnostics()).toContain(failure);

		environment.switchToBackgroundThread();
		await expect(root.render(fixture, props)).rejects.toThrow(failure.message);
	});
});
