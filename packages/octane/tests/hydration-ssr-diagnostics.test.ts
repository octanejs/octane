import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

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

afterAll(() => rmSync(directory, { recursive: true, force: true }));
afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

function diagnosticLines(write: { mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> } }) {
	return write.mock.calls
		.map(([chunk]) => (typeof chunk === 'string' ? chunk : ''))
		.filter((line) => line.startsWith('[OCTANE_HYDRATION_SSR_TRACE] '));
}

describe('SSR hydration diagnostics', () => {
	it('keeps provider output and value evaluation unchanged and successful renders quiet', async () => {
		const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const results: Array<{ html: string; reads: number }> = [];
		for (const tracing of ['0', '1']) {
			vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', tracing);
			let reads = 0;
			const html = await executeHydrationFixture<string>('tanstack-query', fixture, 'render', {
				provided: true,
				get value() {
					reads++;
					return { label: 'provided' };
				},
			});
			const container = document.createElement('div');
			container.innerHTML = html;
			expect(container.textContent).toBe('provided');
			results.push({ html, reads });
		}
		expect(results[1]).toEqual(results[0]);
		expect(diagnosticLines(write)).toEqual([]);
	});

	it('buffers legitimate default Context reads without printing passing renders', async () => {
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
	});

	it('keeps the original thrown object even if diagnostic output is unavailable', async () => {
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
	});

	it('marks failed observations incomplete and retains the original public render error', async () => {
		const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		const error = new Error('original render error');
		for (const tracing of ['0', '1']) {
			vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', tracing);
			await expect(
				executeHydrationFixture('tanstack-query', fixture, 'render', {
					provided: true,
					value: { label: 'provided' },
					error,
					observerError: new Error('observer failure secret'),
				}),
			).rejects.toBe(error);
			if (tracing === '0') expect(diagnosticLines(write)).toEqual([]);
		}
		const lines = diagnosticLines(write);
		expect(lines).toHaveLength(1);
		expect(lines[0]).not.toContain('observer failure secret');
		const diagnostic = JSON.parse(lines[0].slice('[OCTANE_HYDRATION_SSR_TRACE] '.length));
		expect(diagnostic.incomplete).toBe(true);
		expect(diagnostic.diagnosticErrors).toBeGreaterThan(0);
	});

	it('preserves a missing-provider error and reports Context, runtime and scope identities', async () => {
		const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		for (const tracing of ['0', '1']) {
			vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', tracing);
			await expect(
				executeHydrationFixture('tanstack-query', fixture, 'render', {
					provided: false,
					value: { label: 'SSR_TRACE_SECRET' },
				}),
			).rejects.toThrow('No QueryClient set, use QueryClientProvider to set one');
			if (tracing === '0') expect(diagnosticLines(write)).toEqual([]);
		}
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
	});

	it('reports a present provider with an undefined value without changing the error', async () => {
		vi.stubEnv('OCTANE_HYDRATION_SSR_TRACE', '1');
		const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		await expect(
			executeHydrationFixture('tanstack-query', fixture, 'render', {
				provided: true,
				value: undefined,
			}),
		).rejects.toThrow('No QueryClient set, use QueryClientProvider to set one');
		const diagnostic = JSON.parse(
			diagnosticLines(write)[0].slice('[OCTANE_HYDRATION_SSR_TRACE] '.length),
		);
		const provider = diagnostic.events.find(
			(event: { kind: string }) => event.kind === 'provider-write',
		);
		const hit = diagnostic.events.find(
			(event: { kind: string; context: number }) =>
				event.kind === 'read-hit' && event.context === provider.context,
		);
		expect(provider.nonNull).toBe(false);
		expect(hit.nonNull).toBe(false);
		expect(hit.providerScope).toBe(provider.scope.id);
	});
});
