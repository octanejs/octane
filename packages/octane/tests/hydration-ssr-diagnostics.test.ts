import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeHydrationFixture, renderHydrationFixture } from './_hydration-ssr';

const directory = mkdtempSync(join(tmpdir(), 'octane-hydration-trace-'));
const fixture = join(directory, 'context.ts');
writeFileSync(
	fixture,
	`import { createContext, createElement } from 'octane';
import { renderToString } from 'octane/server';
import { QueryClientContext, useQueryClient } from '@octanejs/tanstack-query';
const OtherContext = createContext(undefined);
function Reader(props) {
  const client = useQueryClient();
  if (props.error) throw props.error;
  return createElement('p', null, client.label);
}
export function prepare() {}
export function render(props) {
  const context = props.provided ? QueryClientContext : OtherContext;
  const providerProps = { get value() { return props.value; } };
  const from = Array.from;
  if (props.observerError) Array.from = function(source, ...args) {
    if (source instanceof Map) throw props.observerError;
    return from.call(this, source, ...args);
  };
  try {
    return renderToString(createElement(context, providerProps, createElement(Reader, props))).html;
  } finally { Array.from = from; }
}
`,
);

const inFlight = new Set<Promise<void>>();

function diagnosticCase(run: () => Promise<void>): Promise<void> {
	const operation = run();
	inFlight.add(operation);
	void operation.then(
		() => inFlight.delete(operation),
		() => inFlight.delete(operation),
	);
	return operation;
}

// A test deadline does not cancel its async body or the real SSR server it owns.
// Finish that body before restoring globals that the next case will observe.
afterEach(async () => {
	await Promise.allSettled([...inFlight]);
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});
afterAll(async () => {
	await Promise.allSettled([...inFlight]);
	rmSync(directory, { recursive: true, force: true });
});

for (const tracing of ['0', '1']) {
	beforeAll(async () => {
		vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', tracing);
		try {
			// Bootstrap the actual compiler/runtime/Query graph outside case deadlines.
			// Each case below still loads and executes its own fresh SSR server.
			await executeHydrationFixture('tanstack-query', fixture, 'prepare');
		} finally {
			vi.unstubAllEnvs();
		}
	});
}

function diagnosticLines(write: { mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> } }) {
	return write.mock.calls
		.map(([chunk]) => (typeof chunk === 'string' ? chunk : ''))
		.filter((line) => line.startsWith('[OCTANE_HYDRATION_SSR_TRACE] '));
}

describe('SSR hydration diagnostics', () => {
	describe('provider output with tracing', () => {
		let write: Parameters<typeof diagnosticLines>[0];
		let results: Array<{ html: string; reads: number }>;
		let baselineLines: string[];

		async function renderProvided() {
			let reads = 0;
			const html = await executeHydrationFixture<string>('tanstack-query', fixture, 'render', {
				provided: true,
				get value() {
					reads++;
					return { label: 'provided' };
				},
			});
			return { html, reads };
		}

		beforeEach(() =>
			diagnosticCase(async () => {
				write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
				results = [];
				vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', '0');
				results.push(await renderProvided());
				baselineLines = diagnosticLines(write);
			}),
		);

		it('keeps provider output and value evaluation unchanged and successful renders quiet', () =>
			diagnosticCase(async () => {
				expect(baselineLines).toEqual([]);
				vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', '1');
				results.push(await renderProvided());
				for (const { html } of results) {
					const container = document.createElement('div');
					container.innerHTML = html;
					expect(container.textContent).toBe('provided');
				}
				expect(results[1]).toEqual(results[0]);
				expect(diagnosticLines(write)).toEqual([]);
			}));
	});

	it('buffers legitimate default Context reads without printing passing renders', () =>
		diagnosticCase(async () => {
			vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', '1');
			const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
			const result = await renderHydrationFixture(
				'testing-library',
				'packages/octane/tests/_fixtures/context-consumer-adapted.tsrx',
				'DefaultOutside',
			);
			const container = document.createElement('div');
			container.innerHTML = result.html;
			expect(container.textContent).toBe('default');
			expect(diagnosticLines(write)).toEqual([]);
		}));

	it('keeps the original thrown object even if diagnostic output is unavailable', () =>
		diagnosticCase(async () => {
			vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', '1');
			vi.spyOn(process.stderr, 'write').mockImplementation(() => {
				throw new Error('stderr unavailable');
			});
			const error = new Error('original render error');
			await expect(
				executeHydrationFixture('tanstack-query', fixture, 'render', {
					provided: true,
					value: { label: 'provided' },
					error,
				}),
			).rejects.toBe(error);
		}));

	describe('failed observations with tracing', () => {
		let write: Parameters<typeof diagnosticLines>[0];
		let error: Error;
		let baselineError: unknown;
		let baselineLines: string[];

		beforeEach(() =>
			diagnosticCase(async () => {
				write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
				error = new Error('original render error');
				baselineError = undefined;
				vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', '0');
				try {
					await executeHydrationFixture('tanstack-query', fixture, 'render', {
						provided: true,
						value: { label: 'provided' },
						error,
						observerError: new Error('observer failure secret'),
					});
				} catch (failure) {
					baselineError = failure;
				}
				baselineLines = diagnosticLines(write);
			}),
		);

		it('marks failed observations incomplete and retains the original public render error', () =>
			diagnosticCase(async () => {
				expect(baselineError).toBe(error);
				expect(baselineLines).toEqual([]);
				vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', '1');
				await expect(
					executeHydrationFixture('tanstack-query', fixture, 'render', {
						provided: true,
						value: { label: 'provided' },
						error,
						observerError: new Error('observer failure secret'),
					}),
				).rejects.toBe(error);
				const lines = diagnosticLines(write);
				expect(lines).toHaveLength(1);
				expect(lines[0]).not.toContain('observer failure secret');
				const diagnostic = JSON.parse(lines[0].slice('[OCTANE_HYDRATION_SSR_TRACE] '.length));
				expect(diagnostic.incomplete).toBe(true);
				expect(diagnostic.diagnosticErrors).toBeGreaterThan(0);
			}));
	});

	describe('missing providers with tracing', () => {
		let write: Parameters<typeof diagnosticLines>[0];
		let baselineError: unknown;
		let baselineLines: string[];

		beforeEach(() =>
			diagnosticCase(async () => {
				write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
				baselineError = undefined;
				vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', '0');
				try {
					await executeHydrationFixture('tanstack-query', fixture, 'render', {
						provided: false,
						value: { label: 'SSR_TRACE_SECRET' },
					});
				} catch (failure) {
					baselineError = failure;
				}
				baselineLines = diagnosticLines(write);
			}),
		);

		it('preserves a missing-provider error and reports Context, runtime and scope identities', () =>
			diagnosticCase(async () => {
				expect(() => {
					throw baselineError;
				}).toThrow('No QueryClient set, use QueryClientProvider to set one');
				expect(baselineLines).toEqual([]);
				vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', '1');
				await expect(
					executeHydrationFixture('tanstack-query', fixture, 'render', {
						provided: false,
						value: { label: 'SSR_TRACE_SECRET' },
					}),
				).rejects.toThrow('No QueryClient set, use QueryClientProvider to set one');
				const lines = diagnosticLines(write);
				expect(lines).toHaveLength(1);
				expect(lines[0]).not.toContain('SSR_TRACE_SECRET');
				const diagnostic = JSON.parse(lines[0].slice('[OCTANE_HYDRATION_SSR_TRACE] '.length));
				expect(diagnostic.invocation).toMatchObject({
					binding: 'tanstack-query',
					fixture,
					exportName: 'render',
				});
				expect(diagnostic.phase).toBe('execute-fixture');
				const query = diagnostic.events.find(
					(event: { kind: string }) => event.kind === 'query-context-evaluation',
				);
				const miss = diagnostic.events.find(
					(event: { kind: string; context: number }) =>
						event.kind === 'read-miss' && event.context === query.context,
				);
				const provider = diagnostic.events.find(
					(event: { kind: string }) => event.kind === 'provider-write',
				);
				expect(provider.nonNull).toBe(true);
				expect(provider.context).not.toBe(query.context);
				expect(miss.ancestry.truncated).toBe(false);
				expect(miss.ancestry.cycle).toBe(false);
				expect(
					miss.ancestry.scopes.some((scope: { id: number }) => scope.id === provider.scope.id),
				).toBe(true);
				const runtime = diagnostic.events.find(
					(event: { kind: string; runtime: number }) =>
						event.kind === 'runtime-evaluation' && event.runtime === miss.runtime,
				);
				expect(runtime.moduleId).toMatch(/runtime\.server\.ts$/);
				expect(query.moduleId).toMatch(/tanstack-query\/src\/context\.ts$/);
				expect(diagnostic.transformed).toHaveLength(2);
				expect(
					diagnostic.graph.modules.some(
						(module: { externalize: string | null }) => module.externalize !== null,
					),
				).toBe(true);
				expect(diagnostic.graph.noExternal).toBeDefined();
			}));
	});

	it('reports a present provider with an undefined value without changing the error', () =>
		diagnosticCase(async () => {
			vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', '1');
			const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
			await expect(
				executeHydrationFixture('tanstack-query', fixture, 'render', {
					provided: true,
					value: undefined,
				}),
			).rejects.toThrow('No QueryClient set, use QueryClientProvider to set one');
			const lines = diagnosticLines(write);
			expect(lines).toHaveLength(1);
			const diagnostic = JSON.parse(lines[0].slice('[OCTANE_HYDRATION_SSR_TRACE] '.length));
			expect(diagnostic.invocation).toMatchObject({
				binding: 'tanstack-query',
				fixture,
				exportName: 'render',
			});
			expect(diagnostic.phase).toBe('execute-fixture');
			expect(diagnostic).toMatchObject({
				incomplete: false,
				diagnosticErrors: 0,
				droppedEvents: 0,
				droppedProviderWrites: 0,
				droppedEvaluations: 0,
			});
			const provider = diagnostic.events.find(
				(event: { kind: string }) => event.kind === 'provider-write',
			);
			expect(provider).toBeDefined();
			const hit = diagnostic.events.find(
				(event: { kind: string; context: number }) =>
					event.kind === 'read-hit' && event.context === provider.context,
			);
			expect(hit).toBeDefined();
			expect(provider.nonNull).toBe(false);
			expect(hit.nonNull).toBe(false);
			expect(hit.providerScope).toBe(provider.scope.id);
		}));
});
