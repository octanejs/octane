import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, flushSync, hydrateRoot, type Root } from 'octane';
import { condition } from 'octane/hydration';
import { renderToString } from 'octane/server';
import { createScope, query, type Scope } from 'octane/signals';
import { flushEffects } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	activateStreamedMarkup,
	collectReadableStream,
	deferred,
	resetStreamRuntimeGlobals,
} from './_server-stream.js';
import * as client from './_fixtures/signals-hydration.tsrx';

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/signals-hydration.tsrx',
	{ compileOptions: { nativeReads: true } },
);

describe('native signal server output and adoption', () => {
	let container: HTMLElement;
	let root: Root | undefined;
	const scopes: Scope[] = [];

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		root?.unmount();
		root = undefined;
		for (const scope of scopes) scope.dispose();
		scopes.length = 0;
		container.remove();
		resetStreamRuntimeGlobals();
		flushEffects();
	});

	function state$(scopeKey: string, initial = 'server') {
		const scope = createScope({ scopeKey });
		scopes.push(scope);
		return { scope, value$: scope.signal$('value', initial) };
	}

	it('adopts the server value without rewinding live state or replacing focused hosts', () => {
		const model = state$('native-hydration-ready');
		container.innerHTML = renderToString(server.SignalHydration, model).html;
		const output = container.querySelector('output')!;
		const input = container.querySelector('input')!;
		input.value = 'typed before hydration';
		input.focus();
		input.setSelectionRange(2, 7);
		model.scope.set(model.value$, 'live');
		const observations: string[] = [];
		flushSync(() => {
			root = hydrateRoot(container, client.SignalHydration, {
				...model,
				log: (value: string) => observations.push(value),
			});
			expect(output.textContent).toBe('server');
			expect(model.scope.get(model.value$)).toBe('live');
		});
		expect(observations).toEqual(['server:server:live', 'live:live:live']);
		expect(container.querySelector('output')).toBe(output);
		expect(output.textContent).toBe('live');
		expect(container.querySelector('input')).toBe(input);
		expect(document.activeElement).toBe(input);
		expect(input.value).toBe('typed before hydration');
		expect([input.selectionStart, input.selectionEnd]).toEqual([2, 7]);
	});

	for (const deferredIsland of [false, true]) {
		it(`preserves an early controlled-input edit during ${deferredIsland ? 'island' : 'root'} adoption`, async () => {
			const model = state$('native-controlled-' + deferredIsland, 'server value');
			const when = condition(false);
			const Server = deferredIsland
				? server.DeferredControlledSignalHydration
				: server.ControlledSignalHydration;
			const Client = deferredIsland
				? client.DeferredControlledSignalHydration
				: client.ControlledSignalHydration;
			const props = { ...model, when };
			container.innerHTML = renderToString(Server, props).html;
			const input = container.querySelector('input')!;
			input.value = 'entered before hydration';
			input.focus();
			input.setSelectionRange(4, 11);
			model.scope.set(model.value$, input.value);
			await act(() => {
				root = hydrateRoot(container, Client, props);
			});
			if (deferredIsland)
				await act(() => root!.render(Client, { ...props, when: condition(true) }));
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('entered before hydration');
			expect(model.scope.get(model.value$)).toBe('entered before hydration');
			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd]).toEqual([4, 11]);
			await act(() => {
				input.value = 'typed after adoption';
				input.dispatchEvent(new Event('input', { bubbles: true }));
			});
			expect(model.scope.get(model.value$)).toBe('typed after adoption');
			expect(input.value).toBe('typed after adoption');
		});
	}

	it('keeps strict and snapshot read channels of one node coherent during adoption', () => {
		const model = state$('native-hydration-channels', 'one');
		container.innerHTML = renderToString(server.ChannelsHydration, model).html;
		model.scope.set(model.value$, 'two');
		flushSync(() => {
			root = hydrateRoot(container, client.ChannelsHydration, model);
			expect(container.textContent).toBe('one/one');
		});
		expect(container.textContent).toBe('two/two');
	});

	it('rejects distinct server scope owners with the same key and equal values', () => {
		const first = state$('native-hydration-duplicate-owner', 'equal');
		const second = state$('native-hydration-duplicate-owner', 'equal');
		expect(() => renderToString(server.DuplicateOwnerHydration, { first, second })).toThrow(
			'Multiple data scopes claim native server key',
		);
	});

	it('keeps closing-script strings inert in the native seed sidecar', () => {
		const payload = '</script><script>globalThis.nativeSeedInjection = true</script><!--<script>';
		const model = state$('native-hydration-script-payload', payload);
		container.innerHTML = renderToString(server.SignalHydration, model).html;
		expect(container.querySelectorAll('script:not([type="application/json"])')).toHaveLength(0);
		model.scope.set(model.value$, 'live');
		flushSync(() => {
			root = hydrateRoot(container, client.SignalHydration, model);
			expect(container.querySelector('output')?.textContent).toBe(payload);
		});
		expect(container.querySelector('output')?.textContent).toBe('live');
		expect((globalThis as { nativeSeedInjection?: unknown }).nativeSeedInjection).toBeUndefined();
	});

	it('replays retained latest data while the strict resource read is pending', async () => {
		const model = state$('native-hydration-latest', 'a');
		const pending = deferred<string>();
		const load = query('native-hydration-latest-query', (key: string) =>
			key === 'a' ? Promise.resolve('ready-a') : pending.promise,
		);
		const resource$ = model.scope.asyncSignal$('resource', () =>
			load(model.scope.get(model.value$)),
		);
		await act(() => {});
		model.scope.set(model.value$, 'b');
		const props = { resource$, fallback: 'empty' };
		container.innerHTML = renderToString(server.LatestHydration, props).html;
		const output = container.querySelector('output');
		await act(() => pending.resolve('ready-b'));
		flushSync(() => {
			root = hydrateRoot(container, client.LatestHydration, props);
			expect(container.textContent).toBe('ready-a');
		});
		expect(container.querySelector('output')).toBe(output);
		expect(container.textContent).toBe('ready-b');
	});

	it('replays the authored latest fallback when the server had no retained value', async () => {
		const model = state$('native-hydration-empty-latest');
		const pending = deferred<string>();
		const load = query('native-hydration-empty-latest-query', () => pending.promise);
		const resource$ = model.scope.asyncSignal$('resource', () => load(undefined));
		const props = { resource$, fallback: 'empty' };
		container.innerHTML = renderToString(server.LatestHydration, props).html;
		await act(() => pending.resolve('ready'));
		flushSync(() => {
			root = hydrateRoot(container, client.LatestHydration, props);
			expect(container.textContent).toBe('empty');
		});
		expect(container.textContent).toBe('ready');
	});

	it('rejects a completed nonready snapshot instead of inventing a ready seed', () => {
		const model = state$('native-hydration-pending-snapshot');
		const load = query(
			'native-hydration-pending-snapshot-query',
			() => new Promise<string>(() => {}),
		);
		const resource$ = model.scope.asyncSignal$('resource', () => load(undefined));
		expect(() => renderToString(server.SnapshotHydration, { resource$ })).toThrow(
			'no serializable ready value',
		);
	});

	it('freshly mounts a pending native arm without replacing its adopted sibling', async () => {
		const model = state$('native-hydration-pending-arm', 'a');
		const old = deferred<string>();
		const load = query('native-hydration-pending-arm-query', (key: string) =>
			key === 'a' ? old.promise : Promise.resolve('ready-b'),
		);
		const resource$ = model.scope.asyncSignal$('resource', () =>
			load(model.scope.get(model.value$)),
		);
		const props = { ...model, resource$ };
		container.innerHTML = renderToString(server.NativeBoundaryHydration, props).html;
		const input = container.querySelector('input');
		const onCaughtError = vi.fn();
		model.scope.set(model.value$, 'b');
		await act(() => {
			root = hydrateRoot(container, client.NativeBoundaryHydration, props, { onCaughtError });
		});
		expect(container.querySelector('.resource')?.textContent).toBe('ready-b');
		expect(container.querySelector('input')).toBe(input);
		expect(container.querySelector('.caught')).toBeNull();
		expect(onCaughtError).not.toHaveBeenCalled();
		await act(() => old.resolve('obsolete-a'));
		expect(container.querySelector('.resource')?.textContent).toBe('ready-b');
	});

	it('retains an island historical frame until that island activates', async () => {
		const model = state$('native-hydration-island');
		const blocked = condition(false);
		const observations: string[] = [];
		const props = { ...model, when: blocked, log: (value: string) => observations.push(value) };
		container.innerHTML = renderToString(server.DeferredNativeHydration, props).html;
		const output = container.querySelector('output');
		const outside = container.querySelector('.outside');
		model.scope.set(model.value$, 'live');
		await act(() => {
			root = hydrateRoot(container, client.DeferredNativeHydration, props);
		});
		expect(output?.textContent).toBe('server');
		expect(observations).toEqual([]);
		await act(() =>
			root!.render(client.DeferredNativeHydration, { ...props, when: condition(true) }),
		);
		expect(container.querySelector('output')).toBe(output);
		expect(container.querySelector('.outside')).toBe(outside);
		expect(observations).toEqual(['server:server:live', 'live:live:live']);
		expect(output?.textContent).toBe('live');
	});

	it('scopes streamed ready values separately from shell data and live client demand', async () => {
		const model = state$('native-hydration-stream', 'a');
		const first = deferred<string>();
		const next = deferred<string>();
		const load = query('native-hydration-stream-query', (key: string) =>
			key === 'a' ? first.promise : next.promise,
		);
		const resource$ = model.scope.asyncSignal$('resource', () =>
			load(model.scope.get(model.value$)),
		);
		const props = { ...model, resource$ };
		const streaming = collectReadableStream(server.NativeBoundaryHydration, props);
		await Promise.resolve();
		first.resolve('streamed-a');
		const response = await streaming;
		expect(response.errors).toEqual([]);
		container.innerHTML = response.html;
		activateStreamedMarkup(container);
		const output = container.querySelector('.resource');
		model.scope.set(model.value$, 'b');
		const observations: string[] = [];
		flushSync(() => {
			root = hydrateRoot(container, client.NativeBoundaryHydration, {
				...props,
				resourceLog: (value: string) => observations.push(value),
			});
			expect(container.querySelector('.resource')).toBe(output);
			expect(output?.textContent).toBe('streamed-a');
		});
		expect(observations[0]).toBe('resource:streamed-a');
		await act(() => next.resolve('live-b'));
		expect(container.querySelector('.resource')?.textContent).toBe('live-b');
		expect(container.querySelector('.caught')).toBeNull();
	});
});
