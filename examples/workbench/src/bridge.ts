import { mockIPC } from '@tauri-apps/api/mocks';
import { TASKS, describeTask, logScript } from './fixtures';
import type { LogLine } from './types';

export type BridgeMode = 'tauri' | 'browser';

/**
 * Spacing between streamed log lines, readable when a person is watching.
 * Journeys override it with `?interval=` so the suite spends its time asserting
 * rather than waiting on a cadence chosen for human eyes.
 */
const DEFAULT_LINE_INTERVAL_MS = 150;

interface MockInternals {
	runCallback(id: number, data: unknown): void;
}

/**
 * Under `tauri dev` the real Rust commands answer. In an ordinary browser --
 * the dev server, `vite preview`, and every Playwright journey -- Tauri's own
 * mock bridge answers the same command and event names from local fixtures, so
 * the example builds and is testable with no Rust toolchain installed.
 *
 * The event plugin is implemented here rather than through mockIPC's built-in
 * `shouldMockEvents`: that path matches unlisten on an `id` field, while the
 * real protocol sends `eventId`, so an unsubscribed handler would stay in its
 * registry and warn on every later emit.
 */
export function installBrowserBridge(): BridgeMode {
	if ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ != null) {
		return 'tauri';
	}

	const params = new URLSearchParams(window.location.search);
	const fault = params.get('fault');
	const requestedInterval = Number(params.get('interval'));
	const lineInterval =
		Number.isFinite(requestedInterval) && requestedInterval > 0
			? requestedInterval
			: DEFAULT_LINE_INTERVAL_MS;
	const spentFaults = new Set<string>();
	const listeners = new Map<string, Set<number>>();
	let runTimers: number[] = [];

	const failOnce = (scenario: string, message: string): Promise<never> | null => {
		if (fault !== scenario || spentFaults.has(scenario)) return null;
		spentFaults.add(scenario);
		return Promise.reject(message);
	};

	const deliver = (event: string, payload: unknown) => {
		const internals = (window as unknown as { __TAURI_INTERNALS__: MockInternals })
			.__TAURI_INTERNALS__;
		for (const id of [...(listeners.get(event) ?? [])]) {
			internals.runCallback(id, { event, id, payload });
		}
	};

	const startRun = (taskId: string) => {
		for (const timer of runTimers) window.clearTimeout(timer);
		runTimers = [];
		const lines = logScript(taskId);
		lines.forEach((text, index) => {
			const line: LogLine = {
				taskId,
				seq: index + 1,
				text,
				done: index === lines.length - 1,
			};
			runTimers.push(
				window.setTimeout(() => deliver('workbench:log', line), (index + 1) * lineInterval),
			);
		});
	};

	mockIPC((cmd, payload) => {
		const args = (payload ?? {}) as Record<string, unknown>;
		switch (cmd) {
			case 'plugin:event|listen': {
				const event = String(args.event);
				const handler = Number(args.handler);
				let registered = listeners.get(event);
				if (registered === undefined) listeners.set(event, (registered = new Set()));
				registered.add(handler);
				return handler;
			}
			case 'plugin:event|unlisten':
				listeners.get(String(args.event))?.delete(Number(args.eventId));
				return null;
			case 'list_tasks':
				return failOnce('list', 'the task index is locked by another process') ?? TASKS;
			case 'describe_task':
				return (
					failOnce('describe', 'the task manifest could not be read') ??
					describeTask(String(args.id))
				);
			case 'run_task':
				startRun(String(args.id));
				return null;
			default:
				return null;
		}
	});

	return 'browser';
}
