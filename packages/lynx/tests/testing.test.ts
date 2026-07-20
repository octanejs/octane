import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
	LynxTestingEnv,
	installLynxTestingEnv,
	lynxTestingAvailability,
	uninstallLynxTestingEnv,
} from '@octanejs/lynx/testing';

describe('@octanejs/lynx/testing', () => {
	it('installs a usable JavaScript Lynx environment through the public facade', () => {
		const dom = new JSDOM('<!doctype html><html><body></body></html>');
		installLynxTestingEnv(globalThis, {
			window: dom.window as unknown as Window & typeof globalThis,
		});
		const environment = globalThis.lynxTestingEnv;

		try {
			expect(environment).toBeInstanceOf(LynxTestingEnv);
			expect(globalThis.__BACKGROUND__).toBe(true);
			expect(globalThis.__MAIN_THREAD__).toBe(false);
			expect(globalThis.lynx.getJSModule('GlobalEventEmitter')).toBeDefined();

			// Restore the host before selecting the other thread so clearGlobal()
			// retains the original process globals for final cleanup.
			environment.clearGlobal();
			environment.switchToMainThread();
			expect(globalThis.__MAIN_THREAD__).toBe(true);
			expect(globalThis.__BACKGROUND__).toBe(false);

			const page = globalThis.__CreatePage('testing', 0);
			const view = globalThis.__CreateView(0);
			globalThis.__SetAttribute(view, 'aria-label', 'facade');
			globalThis.__AppendElement(page, view);

			expect(page.firstChild).toBe(view);
			expect(view.getAttribute('aria-label')).toBe('facade');
		} finally {
			environment.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom.window.close();
		}

		expect(globalThis).not.toHaveProperty('lynxTestingEnv');
		expect(globalThis).not.toHaveProperty('lynxEnv');
	});

	it('labels the facade as source-test host emulation, not native execution', () => {
		expect(lynxTestingAvailability).toEqual({
			available: true,
			plannedMilestone: 5,
			implementedMilestone: 5,
			requires: '@lynx-js/testing-environment',
			sourceTests: true,
			execution: 'javascript-host-emulation',
			nativeExecution: false,
			deviceExecution: false,
		});
	});
});
