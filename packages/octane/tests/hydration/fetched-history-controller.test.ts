import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalModuleId } from '../../src/compiler/bundler.js';
import { createScope, runWithSignalOwner } from '../../src/signals/index.js';
import * as Signals from '../../src/signals/index.js';
import {
	createStreamedRegionPlacementFrame,
	createStreamedSignalResultFrames,
	renderToString,
} from '../../src/server/index.js';
import type {
	StreamFrameIdentity,
	StreamedRendererFrame,
} from '../../src/streamed-signals-protocol.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';
import { mountHistoryController } from '../../../vite-plugin-octane/tests/_fixtures/app/src/conversation-history/controller.ts';
import * as State from '../../../vite-plugin-octane/tests/_fixtures/app/src/conversation-history/State.tsrx';
import type { ConversationTurn } from '../../../vite-plugin-octane/tests/_fixtures/app/src/conversation/operations.ts';

const { readPage } = vi.hoisted(() => ({ readPage: vi.fn() }));
vi.mock('../../../vite-plugin-octane/tests/_fixtures/app/src/conversation/Calls.tsrx', () => ({
	readConversationPage: readPage,
}));

const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	vi.restoreAllMocks();
	readPage.mockReset();
	document.body.textContent = '';
});

function turn(id: string, answer = 'working'): ConversationTurn {
	return { id, prompt: id, answer, status: answer === 'working' ? 'running' : 'complete' };
}
function model(
	revision: number,
	turns: ConversationTurn[],
	nextCursor: string | null,
	updates: ConversationTurn[] = [],
): State.HistoryModel {
	return {
		conversationId: 'A',
		revision,
		turns,
		updates,
		nextCursor,
		source: 'fresh',
		receipt: null,
	};
}
function setup() {
	const data = document.createElement('script');
	data.id = '__octane_data';
	data.type = 'application/json';
	data.textContent = JSON.stringify({
		clientBuild: { version: 1, buildId: 'test-build' },
		streamedSignals: { buildId: 'test-build', documentId: 'test-doc' },
	});
	const host = document.createElement('section');
	document.body.append(data, host);
	const owner = createScope({ scopeKey: 'test-document' });
	const serverState = loadCompiledFixtureSource(
		readFileSync(
			'packages/vite-plugin-octane/tests/_fixtures/app/src/conversation-history/State.tsrx',
			'utf8',
		),
		{
			id: canonicalModuleId(
				resolve(
					'packages/vite-plugin-octane/tests/_fixtures/app/src/conversation-history/State.tsrx',
				),
				process.cwd(),
			),
			mode: 'server',
			compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
			runtimeModules: { 'octane/signals': Signals },
		},
	);
	const server = loadCompiledFixtureSource(
		readFileSync(
			'packages/vite-plugin-octane/tests/_fixtures/app/src/conversation-history/History.tsrx',
			'utf8',
		),
		{
			id: canonicalModuleId(
				resolve(
					'packages/vite-plugin-octane/tests/_fixtures/app/src/conversation-history/History.tsrx',
				),
				process.cwd(),
			),
			mode: 'server',
			compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
			runtimeModules: { './State.tsrx': serverState },
		},
	);
	const connections: {
		signal: AbortSignal;
		send(value: State.HistoryModel, styles?: string[]): Promise<void>;
		complete(): void;
	}[] = [];
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
		const url = new URL(String(input), 'https://fixture.test');
		const identity: StreamFrameIdentity = {
			protocol: 1,
			buildId: 'test-build',
			documentId: 'test-doc',
			ownerKey: 'history:test-doc',
			instanceKey: 'history',
			nodeKey: 'model',
			selectionKey: url.searchParams.get('conversation')!,
			selectionGeneration: Number(url.searchParams.get('generation')),
			attempt: 0,
		};
		let stream!: ReadableStreamDefaultController<Uint8Array>;
		let sequence = 0;
		let placementSequence = 0;
		let cancelled = false;
		const emit = (frame: StreamedRendererFrame) => {
			if (!cancelled) stream.enqueue(new TextEncoder().encode(JSON.stringify(frame) + '\n'));
		};
		const body = new ReadableStream<Uint8Array>({
			start(value) {
				stream = value;
			},
			cancel() {
				cancelled = true;
			},
		});
		emit({ identity, channel: 'result', kind: 'open', resource: 'stream', sequence: sequence++ });
		connections.push({
			signal: options!.signal!,
			async send(value, styles) {
				for await (const frame of createStreamedSignalResultFrames(identity, value)) {
					if (frame.kind === 'value') emit({ ...frame, sequence: sequence++ });
				}
				const serverOwner = createScope({ scopeKey: identity.ownerKey });
				try {
					runWithSignalOwner(serverOwner, () => serverState.history$.set(value));
					emit(
						createStreamedRegionPlacementFrame(
							identity,
							renderToString(server.History, {}, { signalOwner: serverOwner }),
							{ sequence: placementSequence++, contentRevision: value.revision + 1, styles },
						),
					);
				} finally {
					serverOwner.dispose();
				}
			},
			complete() {
				emit({ identity, channel: 'result', kind: 'complete', sequence: sequence++ });
				if (!cancelled) stream.close();
			},
		});
		return new Response(body);
	});
	const controller = mountHistoryController(host, owner);
	cleanups.push(() => {
		controller.dispose();
		owner.dispose();
	});
	return { host, owner, controller, connections };
}

it('retains a completed older page and refreshes its known rows during a newer watch value', async () => {
	const { host, controller, connections } = setup();
	await connections[0]!.send(model(10, [turn('3'), turn('4')], '3'));
	await expect.poll(() => host.querySelectorAll('[data-turn]').length).toBe(2);
	const article = host.querySelector('[data-history]');
	readPage.mockResolvedValue({
		conversationId: 'A',
		revision: 10,
		turns: [turn('1'), turn('2')],
		nextCursor: null,
	});
	await controller.older();
	expect(host.querySelector('[data-history]')).toBe(article);
	expect(
		[...host.querySelectorAll('[data-turn]')].map((node) => node.getAttribute('data-turn')),
	).toEqual(['1', '2', '3', '4']);
	const first = host.querySelector('[data-turn="1"]');
	await connections[0]!.send(
		model(11, [turn('3', 'done'), turn('4', 'done')], '3', [
			turn('1', 'authoritative'),
			turn('3', 'done'),
			turn('4', 'done'),
		]),
	);
	await expect
		.poll(() => host.querySelector('[data-turn="1"]')?.textContent)
		.toContain('authoritative');
	expect(host.querySelector('[data-turn="1"]')).toBe(first);
	expect(
		[...host.querySelectorAll('[data-turn]')].map((node) => node.getAttribute('data-turn')),
	).toEqual(['1', '2', '3', '4']);
	await controller.older();
	expect(readPage).toHaveBeenCalledOnce();
	window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
	window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
	window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
	await expect.poll(() => connections.length).toBe(2);
	await connections[1]!.send(model(0, [], null));
	expect(host.querySelector('[data-turn="1"]')).toBe(first);
	await connections[1]!.send(model(12, [turn('3', 'restored'), turn('4', 'restored')], '3'));
	await expect.poll(() => host.querySelector('[data-turn="4"]')?.textContent).toContain('restored');
	expect(
		[...host.querySelectorAll('[data-turn]')].map((node) => node.getAttribute('data-turn')),
	).toEqual(['1', '2', '3', '4']);
	await controller.older();
	expect(readPage).toHaveBeenCalledOnce();
	connections[1]!.complete();
});

it('fences a frozen custom fetch and restarts only its selected unfinished read', async () => {
	const { host, owner, connections } = setup();
	await connections[0]!.send(model(1, [turn('1')], null));
	await expect.poll(() => host.querySelector('[data-turn]')?.textContent).toContain('working');
	runWithSignalOwner(owner, () => State.draftA$.set('retained draft'));
	window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
	expect(connections[0]!.signal.aborted).toBe(true);
	await connections[0]!.send(model(99, [turn('stale', 'wrong document work')], null));
	expect(host.querySelector('[data-turn="stale"]')).toBeNull();
	window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
	await expect.poll(() => connections.length).toBe(2);
	await connections[1]!.send(model(0, [], null));
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(host.querySelector('[data-turn="1"]')?.textContent).toContain('working');
	await connections[1]!.send(model(2, [turn('1', 'restored')], null));
	await expect.poll(() => host.textContent).toContain('restored');
	expect(runWithSignalOwner(owner, () => State.draftA$.get())).toBe('retained draft');
	connections[1]!.complete();
	await new Promise((resolve) => setTimeout(resolve, 0));
	window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
	window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(connections).toHaveLength(2);
});

it.each([false, true])(
	'restarts a terminal result awaiting styles with retained HTML: %s',
	async (retained) => {
		const { host, connections } = setup();
		cleanups.push(() =>
			document.querySelector('link[href$="/required-style-pending.css"]')?.remove(),
		);
		if (retained) {
			await connections[0]!.send(model(0, [turn('old', 'presented')], null));
			await expect
				.poll(() => host.querySelector('[data-turn="old"]')?.textContent)
				.toContain('presented');
		}
		await connections[0]!.send(model(1, [turn('1', 'done')], null), [
			'/required-style-pending.css',
		]);
		connections[0]!.complete();
		await expect
			.poll(() => document.querySelector('link[href$="/required-style-pending.css"]'))
			.not.toBeNull();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(host.querySelector('[data-turn="1"]')).toBeNull();
		window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
		expect(connections[0]!.signal.aborted).toBe(true);
		window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
		await expect.poll(() => connections.length).toBe(2);
		await connections[1]!.send(model(1, [turn('1', 'restored')], null));
		await expect
			.poll(() => host.querySelector('[data-turn="1"]')?.textContent)
			.toContain('restored');
		connections[1]!.complete();
	},
);
