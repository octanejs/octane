import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';
import { installLynxMainThread, type LynxMainThreadController } from '../../src/main-thread.js';
import type { LynxContextProxy } from '../../src/core/protocol.js';

interface EventRegistration {
	readonly node: object;
	readonly name: string;
	readonly listener: string | undefined;
}

interface InstalledEnvironment {
	readonly dom: JSDOM;
	readonly main: LynxMainThreadController;
	readonly registrations: EventRegistration[];
}

let installed: InstalledEnvironment | null = null;

export function mainContext(): LynxContextProxy {
	return (
		globalThis as typeof globalThis & {
			lynx: { getJSContext(): LynxContextProxy };
		}
	).lynx.getJSContext();
}

export function backgroundContext(): LynxContextProxy {
	return (
		globalThis as typeof globalThis & {
			lynx: { getCoreContext(): LynxContextProxy };
		}
	).lynx.getCoreContext();
}

export function installEnvironment(
	configurePAPI?: (target: Record<string, unknown>) => void,
	installOptions?: Partial<Parameters<typeof installLynxMainThread>[0]>,
): InstalledEnvironment {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, {
		window: dom.window as unknown as Window & typeof globalThis,
	});
	globalThis.lynxTestingEnv.switchToMainThread();
	const target = globalThis as unknown as Record<string, unknown>;
	configurePAPI?.(target);
	const registrations: EventRegistration[] = [];
	const addEvent = target.__AddEvent as (
		node: object,
		kind: string,
		name: string,
		listener: string | undefined,
	) => void;
	target.__AddEvent = (node, kind, name, listener) => {
		registrations.push(Object.freeze({ node, name, listener }));
		addEvent(node, kind, name, listener);
	};
	const main = installLynxMainThread({
		firstScreen: true,
		firstScreenSync: 'manual',
		...installOptions,
	});
	return (installed = { dom, main, registrations });
}

export function uninstallEnvironment(): void {
	if (installed !== null) {
		installed.main.close();
		globalThis.lynxTestingEnv.clearGlobal();
		uninstallLynxTestingEnv(globalThis);
		installed.dom.window.close();
	}
	installed = null;
}
