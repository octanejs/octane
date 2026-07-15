/**
 * The small slice of Playwright's ConsoleMessage used by this module.
 *
 * Keep these types structural: examples own their Playwright dependency, while
 * this sibling directory intentionally has no package or dependency graph of
 * its own under pnpm.
 */
export interface BrowserConsoleMessage {
	type(): string;
	text(): string;
}

/** The small slice of Playwright's Page used by the diagnostics collector. */
export interface DiagnosticPage {
	on(event: 'console', listener: (message: BrowserConsoleMessage) => void): unknown;
	on(event: 'pageerror', listener: (error: Error) => void): unknown;
	off(event: 'console', listener: (message: BrowserConsoleMessage) => void): unknown;
	off(event: 'pageerror', listener: (error: Error) => void): unknown;
}

/** The small slice of Playwright's Page used to wait for browser paint turns. */
export interface BrowserFramePage {
	evaluate<Result, Argument>(
		pageFunction: (argument: Argument) => Result | Promise<Result>,
		argument: Argument,
	): Promise<Result>;
}

export interface BrowserDiagnostic {
	kind: 'console' | 'pageerror';
	level: string;
	message: string;
	hydrationWarning: boolean;
}

export interface BrowserDiagnosticsOptions {
	/** Console levels that fail the gate. Defaults to only `error`. */
	failOnConsoleLevels?: readonly string[];
	/**
	 * Also fail on public hydration-mismatch diagnostics emitted at non-error
	 * console levels. This is useful for SSR/hydration journeys and remains off
	 * for intentionally client-only examples.
	 */
	failOnHydrationWarnings?: boolean;
	/** Override the public diagnostic matcher if an integration prefixes it. */
	hydrationWarningPattern?: RegExp;
	/** A narrow escape hatch for an explicitly asserted, expected diagnostic. */
	ignore?: (diagnostic: BrowserDiagnostic) => boolean;
}

export interface BrowserDiagnostics {
	/** A snapshot in the same order the browser delivered the events. */
	readonly records: readonly BrowserDiagnostic[];
	clear(): void;
	stop(): void;
	assertClean(context?: string): void;
}

const DEFAULT_HYDRATION_WARNING_PATTERN = /\bhydration mismatch\b/i;

function normalizeMessage(value: unknown): string {
	const text = value instanceof Error ? value.message : String(value);
	return text.replace(/\r\n?/g, '\n').trim();
}

function errorName(error: Error): string {
	return error.name && error.name !== 'Error' ? `${error.name}: ` : '';
}

function matches(pattern: RegExp, value: string): boolean {
	// Callers may pass a global/sticky RegExp. Resetting avoids a history-dependent
	// result as successive browser messages pass through the same collector.
	pattern.lastIndex = 0;
	return pattern.test(value);
}

export function formatBrowserDiagnostics(records: readonly BrowserDiagnostic[]): string {
	return records
		.map((record, index) => {
			const source = record.kind === 'pageerror' ? 'pageerror' : `console:${record.level}`;
			return `${index + 1}. [${source}] ${record.message}`;
		})
		.join('\n');
}

/**
 * Observe consumer-visible browser failures without coupling tests to Octane's
 * DOM markers, generated helpers, or scheduling internals.
 *
 * Install the collector before navigation and keep it alive through the whole
 * journey. `assertClean` deliberately throws a plain Error so it works with
 * either `@playwright/test` or Playwright driven from another test runner.
 */
export function collectBrowserDiagnostics(
	page: DiagnosticPage,
	options: BrowserDiagnosticsOptions = {},
): BrowserDiagnostics {
	const records: BrowserDiagnostic[] = [];
	const consoleLevels = new Set(options.failOnConsoleLevels ?? ['error']);
	const hydrationPattern = options.hydrationWarningPattern ?? DEFAULT_HYDRATION_WARNING_PATTERN;
	let stopped = false;

	const record = (diagnostic: BrowserDiagnostic) => {
		if (!options.ignore?.(diagnostic)) records.push(diagnostic);
	};

	const onConsole = (consoleMessage: BrowserConsoleMessage) => {
		const level = consoleMessage.type();
		const message = normalizeMessage(consoleMessage.text());
		const hydrationWarning = matches(hydrationPattern, message);
		if (
			consoleLevels.has(level) ||
			(options.failOnHydrationWarnings === true && hydrationWarning)
		) {
			record({ kind: 'console', level, message, hydrationWarning });
		}
	};

	const onPageError = (error: Error) => {
		const message = `${errorName(error)}${normalizeMessage(error)}`;
		record({
			kind: 'pageerror',
			level: 'error',
			message,
			hydrationWarning: matches(hydrationPattern, message),
		});
	};

	page.on('console', onConsole);
	page.on('pageerror', onPageError);

	return {
		get records() {
			return records.slice();
		},
		clear() {
			records.length = 0;
		},
		stop() {
			if (stopped) return;
			stopped = true;
			page.off('console', onConsole);
			page.off('pageerror', onPageError);
		},
		assertClean(context = 'page') {
			if (records.length === 0) return;
			throw new Error(
				`${context} emitted ${records.length} unexpected browser diagnostic${records.length === 1 ? '' : 's'}:\n${formatBrowserDiagnostics(records)}`,
			);
		},
	};
}

/**
 * Allow work queued for the next browser paints to run before checking the
 * diagnostics gate. This is not a private hydration-completion signal: tests
 * must still wait for the journey's observable ready state.
 */
export async function settleBrowserFrames(page: BrowserFramePage, count = 2): Promise<void> {
	if (!Number.isInteger(count) || count < 1) {
		throw new Error(`browser frame count must be a positive integer (received ${count})`);
	}
	await page.evaluate(
		(frames) =>
			new Promise<void>((resolve) => {
				const next = (remaining: number) => {
					if (remaining === 0) resolve();
					else requestAnimationFrame(() => next(remaining - 1));
				};
				next(frames);
			}),
		count,
	);
}
