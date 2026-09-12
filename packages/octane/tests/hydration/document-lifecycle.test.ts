import { afterEach, expect, it, vi } from 'vitest';
import {
	bootstrapStreamedSignalHydration,
	installSignalDocumentLifecycle,
} from '../../src/hydration/streamed-signals.js';
import { registerIndependentHydrationIsland } from '../../src/hydration/independent-island.js';
import { createIndependentHydrateManifest } from '../../src/independent-hydration-protocol.js';
import { createSignalOwnerLifecycle } from '../../src/signals/facade.js';
import { createStreamedRegionReceiver } from '../../src/hydration/stream-receiver.js';
import {
	attachStreamedSignalResult,
	createScope,
	derived$,
	query,
	runWithSignalOwner,
	__signalAt,
	__queryAt,
	action$,
	optimistic$,
	type ActionOperation,
	type SignalOwner,
} from '../../src/signals/index.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	document.body.replaceChildren();
});
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function transition(type: 'pagehide' | 'pageshow', persisted: boolean) {
	window.dispatchEvent(new PageTransitionEvent(type, { persisted }));
}
function metadata() {
	const element = document.createElement('script');
	element.type = 'application/json';
	element.id = '__octane_data';
	element.textContent = JSON.stringify({
		clientBuild: {
			version: 1,
			buildId: 'build',
			mode: 'production',
			capabilities: { independentHydration: false },
		},
		streamedSignals: { buildId: 'build', documentId: 'document' },
	});
	document.body.append(element);
	return element;
}
function install(
	signalOwner = createScope({ scopeKey: 'lifecycle' }),
	readIdentity?: () => { buildId: string; documentId: string } | null,
) {
	if (readIdentity === undefined) metadata();
	const onMismatch = vi.fn();
	const lifecycle = installSignalDocumentLifecycle({
		document,
		signalOwner,
		buildId: 'build',
		documentId: 'document',
		onMismatch,
		readIdentity,
	});
	cleanups.push(() => {
		lifecycle?.dispose();
		signalOwner.dispose();
	});
	return { lifecycle, signalOwner, onMismatch };
}

it('freezes pending reads, fences late results, and restarts only the current selection once', async () => {
	let identity = { buildId: 'build', documentId: 'document' };
	const { signalOwner: owner, onMismatch } = install(undefined, () => identity);
	const selected = owner.signal$('selected', 'A');
	const attempts: {
		key: string;
		signal: AbortSignal;
		result: ReturnType<typeof deferred<string>>;
	}[] = [];
	const fetch = query('lifecycle-read', (key: string, { signal }) => {
		const result = deferred<string>();
		attempts.push({ key, signal, result });
		return result.promise;
	});
	const value = owner.asyncSignal$('value', () => fetch(selected.get()));
	expect(attempts).toHaveLength(1);
	transition('pagehide', true);
	expect(attempts[0].signal.aborted).toBe(true);
	selected.set('B');
	value.snapshot();
	value.retry();
	expect(attempts).toHaveLength(1);
	attempts[0].result.resolve('stale A');
	await tick();
	expect(value.snapshot().status).toBe('pending');
	transition('pageshow', true);
	transition('pageshow', true);
	expect(attempts.map((attempt) => attempt.key)).toEqual(['A', 'B']);
	attempts[1].result.resolve('current B');
	await tick();
	expect(value.get()).toBe('current B');
	transition('pagehide', true);
	identity = { buildId: 'build', documentId: 'replacement' };
	transition('pageshow', true);
	expect(owner.retired).toBe(true);
	expect(onMismatch).toHaveBeenCalledTimes(1);
	expect(attempts).toHaveLength(2);
	for (const readIdentity of [
		() => null,
		() => {
			throw new Error('unavailable host identity');
		},
	]) {
		const { signalOwner, onMismatch: failed } = install(undefined, readIdentity);
		transition('pagehide', true);
		transition('pageshow', true);
		expect(signalOwner.retired).toBe(true);
		expect(failed).toHaveBeenCalledTimes(1);
	}
});

it('freezes instance-local declarations and declarations first read while frozen', async () => {
	metadata();
	const owner = { scopeKey: 'instance-document' };
	const lifecycle = installSignalDocumentLifecycle({
		document,
		signalOwner: owner,
		buildId: 'build',
		documentId: 'document',
	});
	cleanups.push(lifecycle.dispose);
	const rendererOwner: SignalOwner = {
		scopeKey: 'instance-document',
		documentOwner: owner,
		instanceOwner: {},
		instanceKey: 'child',
	};
	const attempts: ReturnType<typeof deferred<string>>[] = [];
	const load = vi.fn(() => {
		const result = deferred<string>();
		attempts.push(result);
		return result.promise;
	});
	const value = __queryAt('i:frozen-child', 'frozen-child', () => 'key', load);
	runWithSignalOwner(rendererOwner, () => value.snapshot());
	transition('pagehide', true);
	const late = runWithSignalOwner(rendererOwner, () =>
		derived$('late-derived', async () => 'late ready'),
	);
	expect(runWithSignalOwner(rendererOwner, () => late.snapshot()).status).toBe('pending');
	attempts[0].resolve('stale');
	await tick();
	expect(runWithSignalOwner(rendererOwner, () => value.snapshot()).status).toBe('pending');
	transition('pageshow', true);
	expect(load).toHaveBeenCalledTimes(2);
	await tick();
	expect(runWithSignalOwner(rendererOwner, () => late.get())).toBe('late ready');
	transition('pagehide', false);
	expect(() => runWithSignalOwner(rendererOwner, () => value.snapshot())).toThrow(
		/retired|disposed/,
	);
});

it.each(['pending', 'complete', 'complete-late'])(
	'fences an old streamed channel across restore (%s)',
	async (mode) => {
		const complete = mode !== 'pending';
		metadata();
		const owner = { scopeKey: 'stream-document' };
		const load = vi.fn(async () => 'browser result');
		const value = __queryAt('g:frozen-wire', 'frozen-wire', () => 'key', load);
		const identity = {
			protocol: 1 as const,
			buildId: 'build',
			documentId: 'document',
			ownerKey: owner.scopeKey,
			instanceKey: 'root',
			nodeKey: 'g:frozen-wire',
			selectionKey: JSON.stringify(['g:frozen-wire', ['string', 'key']]),
			selectionGeneration: 0,
			attempt: 1,
		};
		const early = {
			version: 1,
			frames: [
				{ channel: 'result', kind: 'open', resource: 'promise', identity, sequence: 0 },
				...(complete
					? [
							{
								channel: 'result',
								kind: 'value',
								value: ['string', 'server result'],
								identity,
								sequence: 1,
							},
							{ channel: 'result', kind: 'complete', identity, sequence: 2 },
						]
					: []),
			],
			receive() {},
		};
		const target: Record<string, unknown> = {
			__octaneStreamedSignalSelections: { version: 1, identities: [identity], register() {} },
			__octaneStreamedRenderer: early,
		};
		const streamed = bootstrapStreamedSignalHydration({
			signalOwner: owner,
			buildId: 'build',
			documentId: 'document',
			target,
		});
		const lifecycle = installSignalDocumentLifecycle({
			document,
			signalOwner: owner,
			buildId: 'build',
			documentId: 'document',
			streamedHydration: streamed,
		});
		cleanups.push(lifecycle.dispose);
		if (mode !== 'complete-late')
			expect(runWithSignalOwner(owner, () => value.snapshot()).status).toBe(
				complete ? 'ready' : 'pending',
			);
		expect(load).not.toHaveBeenCalled();
		transition('pagehide', true);
		if (mode === 'complete-late')
			expect(runWithSignalOwner(owner, () => value.snapshot()).status).toBe('pending');
		const stale = {
			channel: 'result' as const,
			kind: 'value' as const,
			value: ['string', 'stale'] as const,
			identity,
			sequence: 1,
		};
		(target.__octaneStreamedRenderer as { receive(frame: unknown): void }).receive(stale);
		expect(await streamed.receiver.receive(stale)).toBe('stale');
		transition('pageshow', true);
		await tick();
		expect(runWithSignalOwner(owner, () => value.get())).toBe(
			complete ? 'server result' : 'browser result',
		);
		expect(load).toHaveBeenCalledTimes(complete ? 0 : 1);

		// A completed result has the same lifetime whether its descriptor is
		// absent or already instantiated but still waiting on another query.
		for (const restoredKey of ['A', 'B']) {
			for (const attachLate of [false, true]) {
				const scope = createScope({ scopeKey: 'dependent-restore' });
				let authCalls = 0;
				let nextAuth = restoredKey;
				const authQuery = query('restore-auth', () =>
					++authCalls === 1 ? new Promise<string>(() => {}) : Promise.resolve(nextAuth),
				);
				const auth = scope.asyncSignal$('auth', () => authQuery(undefined));
				const browser = vi.fn(async (key: string) => `browser ${key}`);
				const bodyQuery = query('restore-body', browser);
				let body =
					mode === 'complete-late'
						? undefined
						: scope.asyncSignal$('body', () => bodyQuery(auth.get()));
				const receiver = createStreamedRegionReceiver({
					buildId: 'build',
					documentId: 'document',
					ownerKey: scope.scopeKey,
				});
				const selection = {
					...identity,
					ownerKey: scope.scopeKey,
					nodeKey: 'body',
					selectionKey: bodyQuery('A').identity,
				};
				receiver.registerSelection(selection);
				let detach = attachLate
					? undefined
					: attachStreamedSignalResult(receiver, scope, selection);
				const lifetime = createSignalOwnerLifecycle(scope);
				try {
					await receiver.receive({
						channel: 'result',
						identity: selection,
						sequence: 0,
						kind: 'open',
						resource: 'promise',
					});
					if (complete) {
						await receiver.receive({
							channel: 'result',
							identity: selection,
							sequence: 1,
							kind: 'value',
							value: ['string', 'server A'],
						});
						await receiver.receive({
							channel: 'result',
							identity: selection,
							sequence: 2,
							kind: 'complete',
						});
					}
					if (body) expect(body.snapshot().status).toBe('pending');
					detach ??= attachStreamedSignalResult(receiver, scope, selection);
					lifetime.freeze();
					detach();
					receiver.dispose();
					lifetime.resume();
					await tick();
					body ??= scope.asyncSignal$('body', () => bodyQuery(auth.get()));
					await tick();
					expect(authCalls).toBe(2);
					expect(body.get()).toBe(
						complete && restoredKey === 'A' ? 'server A' : `browser ${restoredKey}`,
					);
					expect(browser).toHaveBeenCalledTimes(complete && restoredKey === 'A' ? 0 : 1);
					if (restoredKey === 'B') {
						nextAuth = 'A';
						auth.retry();
						await tick();
						expect(body.get()).toBe('browser A');
						expect(browser).toHaveBeenCalledTimes(2);
					}
				} finally {
					detach?.();
					receiver.dispose();
					lifetime.retire();
				}
			}
		}
	},
);

it.each([false, true])(
	'pauses independent activation without unmounting persisted DOM (already active=%s)',
	async (active) => {
		metadata();
		const owner = createScope({ scopeKey: 'island-document' });
		const element = document.createElement('div');
		element.setAttribute('data-octane-hydrate-id', 'widget');
		element.setAttribute('data-octane-hydrate-when', 'interaction');
		element.innerHTML = '<button>Original</button>';
		document.body.append(element);
		const button = element.firstElementChild!;
		const manifest = createIndependentHydrateManifest(
			{
				version: 1,
				boundaryId: 'template',
				exportName: 'default',
				captureSchema: [],
				hookSeed: 0,
				idSeed: 0,
				signalSites: [],
				parentDependencies: false,
			},
			[],
			'widget',
			'build',
			{ moduleId: 'widget.js', styles: [] },
		);
		const module = deferred<Record<string, unknown>>();
		const unmount = vi.fn();
		const activate = vi.fn(() => ({ unmount }));
		const load = vi.fn(() => module.promise);
		const independent = registerIndependentHydrationIsland(element, manifest, {
			load,
			loadStyles() {},
			signalOwner: owner,
		});
		const lifecycle = installSignalDocumentLifecycle({
			document,
			signalOwner: owner,
			buildId: 'build',
			documentId: 'document',
			independentHydration: independent,
		});
		cleanups.push(lifecycle.dispose);
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await tick();
		if (active) {
			module.resolve({ default: activate });
			await tick();
		}
		transition('pagehide', true);
		if (!active) {
			module.resolve({ default: activate });
			await tick();
		}
		expect(activate).toHaveBeenCalledTimes(active ? 1 : 0);
		expect(unmount).not.toHaveBeenCalled();
		expect(element.firstElementChild).toBe(button);
		transition('pageshow', true);
		await tick();
		expect(activate).toHaveBeenCalledTimes(1);
		expect(unmount).not.toHaveBeenCalled();
		expect(load).toHaveBeenCalledTimes(active ? 1 : 2);
		transition('pagehide', false);
		expect(unmount).toHaveBeenCalledTimes(1);
	},
);

it('keeps completed query data and writable drafts without refetching on restore', async () => {
	const { signalOwner: owner } = install();
	const load = vi.fn(async () => 'completed');
	const fetch = query('completed-read', load);
	const value = owner.asyncSignal$('value', () => fetch('key'));
	const draft = owner.signal$('draft', 'typed before navigation');
	await tick();
	transition('pagehide', true);
	transition('pageshow', true);
	expect(value.get()).toBe('completed');
	expect(draft.get()).toBe('typed before navigation');
	expect(load).toHaveBeenCalledTimes(1);
	expect(owner.retired).toBe(false);
});

it('keeps an uncertain accepted write for reconciliation without submitting it again', () => {
	const { signalOwner: owner } = install();
	const source = __signalAt('g:lifecycle-write', 'old');
	const visible = optimistic$(source);
	let operation!: ActionOperation;
	const mutate = vi.fn((op: ActionOperation) => {
		operation = op;
		visible.set('tentative');
		return op.uncertain();
	});
	const save = action$('lifecycle-write', mutate);
	runWithSignalOwner(owner, () => save());
	transition('pagehide', true);
	transition('pageshow', true);
	expect(mutate).toHaveBeenCalledTimes(1);
	expect(operation.status).toBe('uncertain');
	expect(runWithSignalOwner(owner, () => visible.get())).toBe('tentative');
	operation.adopt('authoritative');
	expect(runWithSignalOwner(owner, () => visible.get())).toBe('authoritative');
});

it('blocks abort-handler reentrant refetch and starts exactly one replacement', async () => {
	const { signalOwner: owner } = install();
	let value: ReturnType<typeof owner.asyncSignal$>;
	const load = vi.fn((_key: string, { signal }: { signal: AbortSignal }) => {
		signal.addEventListener('abort', () => {
			if (!owner.retired) value.retry();
		});
		return new Promise<string>(() => {});
	});
	const fetch = query('reentrant-read', load);
	value = owner.asyncSignal$('value', () => fetch('key'));
	transition('pagehide', true);
	expect(load).toHaveBeenCalledTimes(1);
	transition('pageshow', true);
	expect(load).toHaveBeenCalledTimes(2);
});

it('revokes pending derived continuations without losing completed synchronous data', async () => {
	const { signalOwner: owner } = install();
	const results = [deferred<string>(), deferred<string>()];
	let starts = 0;
	const value = runWithSignalOwner(owner, () =>
		derived$('async-value', () => results[starts++].promise),
	);
	expect(runWithSignalOwner(owner, () => value.snapshot()).status).toBe('pending');
	transition('pagehide', true);
	results[0].resolve('stale');
	await tick();
	expect(runWithSignalOwner(owner, () => value.snapshot()).status).toBe('pending');
	transition('pageshow', true);
	expect(starts).toBe(2);
	results[1].resolve('fresh');
	await tick();
	expect(runWithSignalOwner(owner, () => value.get())).toBe('fresh');
});

it.each(['build', 'document', 'owner'])(
	'retires rather than resumes when the %s identity changes',
	(changed) => {
		const { signalOwner: owner, onMismatch } = install();
		const load = vi.fn(() => new Promise<string>(() => {}));
		const fetch = query('mismatch-read', load);
		owner.asyncSignal$('value', () => fetch('key'));
		transition('pagehide', true);
		const element = document.getElementById('__octane_data')!;
		const data = JSON.parse(element.textContent!);
		if (changed === 'build') data.clientBuild.buildId = 'other';
		else if (changed === 'document') data.streamedSignals.documentId = 'other';
		else owner.dispose();
		element.textContent = JSON.stringify(data);
		transition('pageshow', true);
		expect(owner.retired).toBe(true);
		expect(load).toHaveBeenCalledTimes(1);
		expect(onMismatch).toHaveBeenCalledTimes(1);
	},
);

it('retires the owner on an ordinary exit instead of preserving a reusable document lease', () => {
	const { signalOwner: owner } = install();
	transition('pagehide', false);
	expect(owner.retired).toBe(true);
});
