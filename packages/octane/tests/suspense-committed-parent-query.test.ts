import { describe, expect, it } from 'vitest';
import { act, createRoot } from 'octane';
import * as signals from 'octane/signals';
import { createScope } from 'octane/signals';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { controlledStream, deferred } from './_fixtures/signals-async-controls.js';

// A component's declaration belongs to the render that evaluated it, even when
// only one of its directive arms reads it. A @try arm whose attempt suspends and
// is discarded must not discard the declaration of a component render that
// commits, or that component's superseded request stays live (#1697).

// The octane project covers the dev compile; octane-prod covers prod.
const dev = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';

const DECLARATIONS = {
	query: `query$(() => props.selection, props.load)`,
	stream: `query$(() => props.selection, props.load, { kind: 'stream' })`,
	// Captured render values never restart asynchronous work; the accepted
	// computation runs at the next restart that a dependency causes.
	derived: `derived$(({ signal }) =>
		props.load(props.selection + ':' + String(props.version$.get()), { signal }),
	)`,
};

const READS = {
	// The strict read suspends the arm's attempt while the selection is pending.
	get: `result$.get() as string`,
	// The control: a snapshot read never suspends the arm.
	snapshot: `result$.snapshot().status as string`,
};

type DeclarationName = keyof typeof DECLARATIONS;
type ReadName = keyof typeof READS;

// Compile at collection: a cold compile under load must not spend a test's timeout.
const compiled = new Map<string, any>();
function compileApp(declaration: DeclarationName, read: ReadName, strong: boolean): any {
	const key = `${declaration}-${read}-${strong}`;
	let module = compiled.get(key);
	if (module === undefined) {
		const source = `import { useLayoutEffect } from 'octane';
import { derived$, query$ } from 'octane/signals';
export function App(props) @{
	const result$ = ${DECLARATIONS[declaration]};
	useLayoutEffect(() => {
		props.onCommit(props.selection);
	});
	<main>
		<span>{props.selection as string}</span>
		@try {
			<output>{${READS[read]}}</output>
		} @pending {
			<i>{'pending'}</i>
		}
	</main>
}`;
		module = loadCompiledFixtureSource(source, {
			id: `/src/committed-parent-${key}.tsrx`,
			mode: 'client',
			compileOptions: { dev, hmr: false, strong },
			runtimeModules: { 'octane/signals': signals },
		});
		compiled.set(key, module);
	}
	return module;
}

interface Request {
	selection: string;
	signal: AbortSignal;
	/** Resolve a promise, or yield a stream value. */
	publish(value: string): void;
	/** Iterator closes the runtime requested; always 0 for a promise. */
	cancellations(): number;
}

async function scenario(
	declaration: DeclarationName,
	read: ReadName,
	strong: boolean,
	run: (harness: {
		requests: Request[];
		selections: () => string[];
		commits: string[];
		select: (selection: string) => Promise<void>;
		publish: (request: Request | undefined, value: string) => Promise<void>;
		bump: () => Promise<void>;
		shown: () => string;
		selected: () => string;
		unmount: () => void;
	}) => Promise<void>,
): Promise<void> {
	const { App } = compileApp(declaration, read, strong);
	const requests: Request[] = [];
	const load = (selection: string, { signal }: { signal: AbortSignal }) => {
		if (declaration === 'stream') {
			const stream = controlledStream<string>();
			requests.push({
				selection,
				signal,
				publish: (value) => stream.emit(value),
				cancellations: () => stream.cancellations,
			});
			return stream.iterable;
		}
		const result = deferred<string>();
		requests.push({ selection, signal, publish: result.resolve, cancellations: () => 0 });
		return result.promise;
	};
	const scope = createScope({ scopeKey: 'committed-parent-query' });
	const version$ = scope.signal$('version', 0);
	const commits: string[] = [];
	const onCommit = (selection: string) => {
		commits.push(selection);
	};
	const props$ = (selection: string) => ({ selection, load, version$, onCommit });
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	let mounted = true;
	const unmount = () => {
		if (!mounted) return;
		mounted = false;
		root.unmount();
		container.remove();
	};
	try {
		await act(() => root.render(App, props$('A')));
		await run({
			requests,
			selections: () => requests.map((request) => request.selection),
			commits,
			select: (selection) => act(() => root.render(App, props$(selection))),
			publish: (request, value) => act(() => request?.publish(value)),
			bump: () => act(() => version$.set(version$.get() + 1)),
			// A pending boundary keeps its completed primary hidden behind the fallback.
			shown: () =>
				container.querySelector('i') !== null
					? 'pending'
					: (container.querySelector('output')?.textContent ?? ''),
			selected: () => container.querySelector('span')?.textContent ?? '',
			unmount,
		});
	} finally {
		unmount();
		scope.dispose();
	}
}

describe.each([true, false])(
	'a committed parent query read by its @try arm (strong: %s)',
	(strong) => {
		describe.each(['query', 'stream'] as const)('%s', (declaration) => {
			compileApp(declaration, 'get', strong);
			compileApp(declaration, 'snapshot', strong);

			it('releases the superseded pending selection when the parent commits', async () => {
				await scenario(declaration, 'get', strong, async (harness) => {
					const { requests, selections, commits, select, publish, shown, selected } = harness;
					expect(shown()).toBe('pending');
					await select('B');
					expect(commits).toEqual(['A', 'B']);
					expect(selected()).toBe('B');
					expect(shown()).toBe('pending');
					expect(selections()).toEqual(['A', 'B']);
					expect(requests[0]!.signal.aborted).toBe(true);
					expect(requests[0]!.cancellations()).toBe(declaration === 'stream' ? 1 : 0);
					expect(requests[1]!.signal.aborted).toBe(false);

					await publish(requests[1], 'B:1');
					expect(shown()).toBe('B:1');
					expect(requests[1]!.signal.aborted).toBe(false);
					// The superseded request cannot publish over the revealed selection.
					await publish(requests[0], 'stale');
					expect(shown()).toBe('B:1');
					expect(selections()).toEqual(['A', 'B']);
				});
			});

			it('keeps the pending request across a parent render with the same selection', async () => {
				await scenario(declaration, 'get', strong, async (harness) => {
					const { requests, selections, select, publish, shown, unmount } = harness;
					await select('A');
					expect(selections()).toEqual(['A']);
					expect(requests[0]!.signal.aborted).toBe(false);
					await publish(requests[0], 'A:1');
					expect(shown()).toBe('A:1');
					unmount();
					expect(requests[0]!.signal.aborted).toBe(declaration === 'stream');
				});
			});

			it('releases a superseded selection while the boundary shows its content', async () => {
				await scenario(declaration, 'get', strong, async (harness) => {
					const { requests, selections, commits, select, publish, shown } = harness;
					await publish(requests[0], 'A:1');
					expect(shown()).toBe('A:1');
					await select('B');
					expect(commits).toEqual(['A', 'B']);
					expect(shown()).toBe('pending');
					expect(selections()).toEqual(['A', 'B']);
					// A settled promise has nothing left to cancel; an open stream does.
					expect(requests[0]!.signal.aborted).toBe(declaration === 'stream');
					expect(requests[0]!.cancellations()).toBe(declaration === 'stream' ? 1 : 0);
					await publish(requests[1], 'B:1');
					expect(shown()).toBe('B:1');
					expect(requests[1]!.signal.aborted).toBe(false);
				});
			});

			it('releases the superseded selection when the arm reads a snapshot', async () => {
				await scenario(declaration, 'snapshot', strong, async (harness) => {
					const { requests, selections, commits, select, publish, shown } = harness;
					expect(shown()).toBe('pending');
					await select('B');
					expect(commits).toEqual(['A', 'B']);
					expect(selections()).toEqual(['A', 'B']);
					expect(requests[0]!.signal.aborted).toBe(true);
					await publish(requests[1], 'B:1');
					expect(shown()).toBe('ready');
				});
			});
		});

		describe('derived', () => {
			compileApp('derived', 'get', strong);
			compileApp('derived', 'snapshot', strong);

			it.each(['get', 'snapshot'] as const)(
				'restarts with the committed computation after a %s read',
				async (read) => {
					await scenario('derived', read, strong, async (harness) => {
						const { requests, selections, commits, select, publish, bump, shown } = harness;
						await select('B');
						expect(commits).toEqual(['A', 'B']);
						// New render values alone do not restart the pending attempt.
						expect(selections()).toEqual(['A:0']);
						expect(requests[0]!.signal.aborted).toBe(false);
						await bump();
						expect(selections()).toEqual(['A:0', 'B:1']);
						expect(requests[0]!.signal.aborted).toBe(true);
						await publish(requests[1], 'B:1');
						expect(shown()).toBe(read === 'get' ? 'B:1' : 'ready');
					});
				},
			);
		});
	},
);
