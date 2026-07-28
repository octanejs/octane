/**
 * End-to-end coverage for the path the Lynx engine actually uses.
 *
 * `__AddEvent` installs an Octane token as an element's handler, and the engine
 * resolves that token by calling `lynxCoreInject.tt.publishEvent` on the
 * background thread. These tests drive events by dispatching them on the real
 * elements the official Element PAPI created, so the delivery runs through the
 * engine's own `publishEvent` call rather than through the main-thread test
 * bridge every other suite uses.
 */
import { JSDOM } from 'jsdom';
import {
	installLynxTestingEnv,
	type LynxTestingEnv,
	uninstallLynxTestingEnv,
} from '@lynx-js/testing-environment';
import type { UniversalComponent } from 'octane/universal/native';
import { afterEach, describe, expect, it } from 'vitest';
import { createLynxRoot, type LynxRoot } from '../src/index.js';
import { installLynxMainThread, type LynxMainThreadController } from '../src/main-thread.js';
import { NativeEventFixture } from './_fixtures/native-event.lynx.tsrx';

interface FixtureProps {
	readonly log: (entry: string) => void;
}

const fixture = NativeEventFixture as UniversalComponent<FixtureProps>;

interface InstalledEnvironment {
	readonly dom: JSDOM;
	readonly env: LynxTestingEnv;
	readonly main: LynxMainThreadController;
}

let installed: InstalledEnvironment | null = null;
let backgroundRoot: LynxRoot | null = null;

function installEnvironment(): InstalledEnvironment {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, {
		window: dom.window as unknown as Window & typeof globalThis,
	});
	const env = globalThis.lynxTestingEnv;
	env.switchToMainThread();
	const main = installLynxMainThread();
	env.switchToBackgroundThread();
	return (installed = { dom, env, main });
}

/** Let the async transport settle a commit and any event-driven re-render. */
async function settle(): Promise<void> {
	await backgroundRoot!.flushTransport();
	for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

/**
 * Dispatch through the element the Element PAPI created, which is what the
 * official environment's `__AddEvent` listener is registered on. That listener
 * is the one that calls `lynxCoreInject.tt.publishEvent`.
 */
function tap(dom: JSDOM, selector: string, kind = 'bindEvent', detail: unknown = {}): void {
	const element = dom.window.document.querySelector(selector);
	if (element === null) throw new Error(`no element matched ${selector}`);
	const event = new dom.window.Event(`${kind}:tap`, { bubbles: true, cancelable: true });
	// The environment routes a DOM event, but a native Lynx event names the event
	// rather than the PAPI channel it was bound on and carries a plain
	// id/uid/dataset target. `type`, `target`, and `currentTarget` are read-only
	// Event accessors, so the native shape is defined over them.
	const lynxTarget = { id: element.id, uid: 1, dataset: {} };
	for (const [name, value] of [
		['type', 'tap'],
		['target', lynxTarget],
		['currentTarget', lynxTarget],
	] as const) {
		Object.defineProperty(event, name, { configurable: true, value });
	}
	Object.assign(event, { timestamp: 1, detail });
	element.dispatchEvent(event);
}

afterEach(async () => {
	if (backgroundRoot !== null) {
		try {
			await backgroundRoot.unmount();
		} catch {
			// A closed transport may already have torn the root down.
		}
	}
	backgroundRoot = null;
	if (installed !== null) {
		installed.main.close();
		installed.env.clearGlobal();
		uninstallLynxTestingEnv(globalThis);
		installed.dom.window.close();
	}
	installed = null;
});

describe.sequential('@octanejs/lynx native background event delivery', () => {
	it('runs a background handler for a tap the engine publishes, and re-renders', async () => {
		const { dom } = installEnvironment();
		const log: string[] = [];
		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(fixture, { log: (entry) => log.push(entry) });
		await settle();

		expect(dom.window.document.querySelector('#target')).not.toBe(null);
		expect(log).toEqual([]);

		tap(dom, '#target', 'bindEvent', { marker: 'first' });
		await settle();

		// The tap bubbles, so the shell's handler runs after the target's, still
		// closed over the pre-tap render's `taps`.
		expect(log).toEqual(['target:tap:first', 'shell:0']);
		expect(dom.window.document.querySelector('#shell')?.textContent).toContain('taps: 1');

		tap(dom, '#target', 'bindEvent', { marker: 'second' });
		await settle();

		expect(log).toEqual(['target:tap:first', 'shell:0', 'target:tap:second', 'shell:1']);
		expect(dom.window.document.querySelector('#shell')?.textContent).toContain('taps: 2');
	});

	it('delivers one propagation path as a single event scope', async () => {
		const { dom } = installEnvironment();
		const log: string[] = [];
		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(fixture, { log: (entry) => log.push(entry) });
		await settle();

		// The event bubbles, so the engine publishes the child's handler and then
		// the shell's. Both must run, in propagation order.
		tap(dom, '#target', 'bindEvent', { marker: 'bubbled' });
		await settle();

		expect(log).toEqual(['target:tap:bubbled', 'shell:0']);
	});

	it('runs catch handlers and leaves foreign handler tokens to their owner', async () => {
		const { dom } = installEnvironment();
		const log: string[] = [];
		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(fixture, { log: (entry) => log.push(entry) });
		await settle();

		tap(dom, '#caught', 'catchEvent');
		await settle();
		expect(log).toEqual(['caught']);

		const engine = (globalThis as unknown as { lynxCoreInject: { tt: Record<string, unknown> } })
			.lynxCoreInject.tt;
		const publishEvent = engine.publishEvent as (handler: unknown, event: unknown) => unknown;
		expect(publishEvent).toBeTypeOf('function');
		// A handler this root does not own must fall through rather than throw
		// into the engine's dispatch.
		expect(() => publishEvent('some-other-framework:handler', { type: 'tap' })).not.toThrow();
	});

	it('drops a tap that names a host the background no longer owns', async () => {
		const { dom } = installEnvironment();
		const log: string[] = [];
		const diagnostics: Error[] = [];
		backgroundRoot = createLynxRoot({ onDiagnostic: (error) => diagnostics.push(error) });
		await backgroundRoot.render(fixture, { log: (entry) => log.push(entry) });
		await settle();

		// Reuse the live root id so the token is genuinely this root's, and name a
		// host id it never accepted.
		const selector = dom.window.document.querySelector('#target')!.getAttribute('octane-ref')!;
		const root = Number(/^r(\d+)-/.exec(selector)![1]);
		const engine = (globalThis as unknown as { lynxCoreInject: { tt: Record<string, unknown> } })
			.lynxCoreInject.tt;
		const publishEvent = engine.publishEvent as (handler: unknown, event: unknown) => unknown;

		publishEvent(`octane-lynx:event:${root}:999999:1:1:discrete`, {
			type: 'tap',
			timestamp: 1,
			target: { id: 'target', uid: 1, dataset: {} },
		});
		await settle();

		expect(log).toEqual([]);
		expect(diagnostics.map((error) => error.message).join(' ')).toMatch(/stale native event/);
	});

	it('stops delivering after the root unmounts', async () => {
		const { dom } = installEnvironment();
		const log: string[] = [];
		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(fixture, { log: (entry) => log.push(entry) });
		await settle();

		const target = dom.window.document.querySelector('#target')!;
		await backgroundRoot.unmount();
		backgroundRoot = null;

		const event = new dom.window.Event('bindEvent:tap', { bubbles: true });
		Object.defineProperty(event, 'type', { configurable: true, value: 'tap' });
		Object.assign(event, { timestamp: 1, detail: { marker: 'late' } });
		expect(() => target.dispatchEvent(event)).not.toThrow();
		for (let turn = 0; turn < 8; turn++) await Promise.resolve();

		expect(log).toEqual([]);
	});
});
