// The parts of React's Jest environment that the pinned use-sync-external-store
// tests use: a module registry with jest.mock/resetModules/requireActual, the
// `gate` feature flags, Scheduler.log, internal-test-utils, and the noop
// renderer. The pristine lane runs it over React and the hash-pinned npm
// artifact; the adapted lane runs it over Octane and this binding.
import { createRequire } from 'node:module';
import { afterEach, beforeEach, expect } from 'vitest';
import { populateGlobal } from 'vitest/runtime';

interface TestRoot {
	render(element: unknown): void;
}

export interface UpstreamRuntime {
	/** Loaders for every module specifier the pinned tests may require. */
	modules: Record<string, () => unknown>;
	act(callback: () => unknown): PromiseLike<unknown>;
	createRoot(container: Element): TestRoot;
	batchedUpdates(callback: () => void): void;
}

// The build-test configuration: the npm artifact (not source) on React 18+,
// where `use-sync-external-store/shim` forwards to the built-in hook.
const flags: Record<string, boolean> = { enableUseSyncExternalStoreShim: false, source: false };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOOP_CONTAINER = Symbol('noop container');

expect.extend({
	// Every pinned noop assertion renders plain text.
	toMatchRenderedOutput(root: { [NOOP_CONTAINER]: Element }, expected: string) {
		const actual = root[NOOP_CONTAINER].textContent;
		return {
			pass: actual === expected,
			message: () =>
				`expected rendered output ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`,
		};
	},
});

// The noop renderer needs no host, and the pinned tests that use it run in
// Node. Its DOM stand-in installs a document there when it first renders.
function noopDocument(): Document {
	if (typeof document === 'undefined') {
		const { JSDOM } = createRequire(import.meta.url)('jsdom');
		const { window } = new JSDOM('', { url: 'http://localhost/' });
		populateGlobal(globalThis, window, { bindFunctions: true });
	}
	return document;
}

// React's Jest setup ignores an error logger's addendum: a format string whose
// first argument is an Error (scripts/jest/shouldIgnoreConsoleError.js).
const isErrorAddendum = ([format, first]: unknown[]) =>
	typeof format === 'string' &&
	typeof first === 'object' &&
	first !== null &&
	typeof (first as Error).message === 'string' &&
	typeof (first as Error).stack === 'string';

// React's component stacks differ per renderer and build; compare the message.
const withoutComponentStack = (message: string) => message.split('\n    in ')[0];

function formatConsoleArguments([format, ...args]: unknown[]): string {
	if (typeof format !== 'string') return [format, ...args].map(String).join(' ');
	let index = 0;
	const message = format.replace(/%[sdif]/g, () => String(args[index++]));
	return [message, ...args.slice(index).map(String)].join(' ');
}

export function createUpstreamHarness(runtime: UpstreamRuntime) {
	const log: unknown[] = [];
	const consoleErrors: string[] = [];
	const mocks = new Map<string, () => unknown>();
	const registry = new Map<string, unknown>();
	let originalConsoleError: typeof console.error;

	beforeEach(() => {
		log.length = 0;
		consoleErrors.length = 0;
		originalConsoleError = console.error;
		console.error = (...args: unknown[]) => {
			if (!isErrorAddendum(args)) consoleErrors.push(formatConsoleArguments(args));
		};
	});
	afterEach(() => {
		console.error = originalConsoleError;
		// internal-test-utils fails a test that leaves a console error unasserted.
		expect(consoleErrors, 'unasserted console.error calls').toEqual([]);
	});

	function requireActual(specifier: string): unknown {
		const load = runtime.modules[specifier] ?? stubs[specifier];
		if (load === undefined) throw new Error(`Unexpected upstream import: ${specifier}`);
		return load();
	}

	function require(specifier: string): unknown {
		if (!registry.has(specifier)) {
			const mock = mocks.get(specifier);
			registry.set(specifier, mock === undefined ? requireActual(specifier) : mock());
		}
		return registry.get(specifier);
	}

	const jest = {
		resetModules() {
			registry.clear();
		},
		mock(specifier: string, factory: () => unknown) {
			mocks.set(specifier, factory);
			registry.delete(specifier);
		},
		requireActual,
	};

	const internalTestUtils = {
		act: (callback: () => unknown) => runtime.act(callback),
		assertLog(expected: unknown[]) {
			const actual = log.splice(0);
			expect(actual).toEqual(expected);
		},
		assertConsoleErrorDev(expected: string[]) {
			const actual = consoleErrors.splice(0);
			expect(actual.map(withoutComponentStack)).toEqual(expected.map(withoutComponentStack));
		},
	};

	const stubs: Record<string, () => unknown> = {
		scheduler: () => ({ log: (value: unknown) => log.push(value) }),
		'internal-test-utils': () => internalTestUtils,
		'react-noop-renderer': () => ({
			batchedUpdates: runtime.batchedUpdates,
			createRoot() {
				const container = noopDocument().createElement('div');
				const root = runtime.createRoot(container);
				return { [NOOP_CONTAINER]: container, render: (element: unknown) => root.render(element) };
			},
		}),
	};

	return {
		__DEV__: process.env.NODE_ENV !== 'production',
		require,
		jest,
		gate: (condition: (testFlags: Record<string, boolean>) => boolean) => condition(flags),
	};
}
