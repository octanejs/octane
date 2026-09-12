import type { Context, Middleware } from '@octanejs/app-core';
import {
	createStreamedRegionPlacementFrame,
	createStreamedRendererFrameStream,
	createStreamedSignalResultFrames,
	renderToString,
	type ServerCallContext,
} from 'octane/server';
import { createScope, runWithSignalOwner } from 'octane/signals';
import type { StreamFrameIdentity, StreamedRendererFrame } from 'octane/hydration';
import { conversations } from '../conversation/host.ts';
import type { ConversationPage, ConversationTurn } from '../conversation/operations.ts';
import { History } from './History.tsrx';
import { history$, type HistoryModel } from './State.tsrx';

// Example host policy, not an Octane cache: bounded authorized input snapshots.
// Never retain rendered HTML, a document token, a nonce, or an adoption lease.
const cachedPages = new Map<string, { page: ConversationPage; until: number }>();

function authorized(context: Context): ServerCallContext {
	if (typeof context.viewer !== 'string' || !context.viewer)
		throw new Error('Authorization required');
	return { request: context.request, signal: context.request.signal, viewer: context.viewer };
}

export const acceptUrlAction: Middleware = async (context, next) => {
	const prompt = context.url.searchParams.get('q');
	if (prompt !== null) {
		const operationId = context.url.searchParams.get('operation');
		if (!operationId) return new Response('A stable operation ID is required', { status: 400 });
		// Acceptance is a request action. Rendering and hydration never submit it.
		conversations.start({ operationId, conversationId: 'A', prompt }, authorized(context));
	}
	return next();
};

export function fetchHistory(context: Context): Response {
	const authority = authorized(context);
	const params = context.url.searchParams;
	const documentId = params.get('document');
	const id = params.get('conversation');
	const generation = Number(params.get('generation'));
	const build = context.clientBuild;
	if (!build || params.get('build') !== build.buildId)
		return new Response('Client build changed', { status: 409 });
	if (
		!documentId ||
		!/^[a-zA-Z0-9-]{1,128}$/.test(documentId) ||
		(id !== 'A' && id !== 'B') ||
		!Number.isSafeInteger(generation) ||
		generation <= 0
	)
		return new Response('Invalid region selection', { status: 400 });
	const identity: StreamFrameIdentity = {
		protocol: 1,
		buildId: build.buildId,
		documentId,
		ownerKey: 'history:' + documentId,
		instanceKey: 'history',
		nodeKey: 'model',
		selectionKey: id,
		selectionGeneration: generation,
		attempt: 0,
	};
	const styles = context.clientAssets?.['/src/conversation-history/App.tsrx']?.css ?? [];
	const operation = params.get('operation');
	const key = JSON.stringify([authority.viewer, id]);
	let cached = cachedPages.get(key);
	if (cached !== undefined && cached.until <= Date.now()) {
		cachedPages.delete(key);
		cached = undefined;
	}
	if (cached === undefined) {
		cached = { page: conversations.page(id, null, authority), until: Date.now() + 60_000 };
		if (cachedPages.size === 16) cachedPages.delete(cachedPages.keys().next().value!);
		cachedPages.set(key, cached);
	}
	const cachedPage = cached.page;
	async function* frames(): AsyncGenerator<StreamedRendererFrame> {
		let resultSequence = 0;
		let placementSequence = 0;
		yield {
			identity,
			sequence: resultSequence++,
			channel: 'result',
			kind: 'open',
			resource: 'stream',
		};
		const render = (
			page: ConversationPage,
			source: HistoryModel['source'],
			updates: ConversationTurn[],
		) => {
			authority.signal.throwIfAborted();
			const receipt = operation === null ? null : conversations.receipt(operation, authority);
			const model: HistoryModel = {
				...page,
				updates,
				source,
				receipt: receipt?.conversationId === identity.selectionKey ? receipt : null,
			};
			const owner = createScope({ scopeKey: identity.ownerKey });
			try {
				runWithSignalOwner(owner, () => history$.set(model));
				const rendered = renderToString(
					History,
					{},
					{ signalOwner: owner, headChannel: 'separate' },
				);
				return {
					model,
					placement: createStreamedRegionPlacementFrame(identity, rendered, {
						sequence: placementSequence++,
						contentRevision: page.revision + 1,
						styles,
					}),
				};
			} finally {
				owner.dispose();
			}
		};
		async function* snapshot(
			page: ConversationPage,
			source: HistoryModel['source'],
			updates: ConversationTurn[] = [],
		) {
			const { model, placement } = render(page, source, updates);
			// Both channels carry the same selected revision; placement may be stale
			// after activation while its authoritative model remains useful.
			for await (const result of createStreamedSignalResultFrames(identity, model)) {
				if (result.kind === 'value') yield { ...result, sequence: resultSequence++ };
			}
			yield placement;
		}
		yield* snapshot(cachedPage, 'cached');
		// Simulate the example origin revalidation without delaying cached paint.
		await new Promise<void>((resolve) => {
			const done = () => {
				clearTimeout(timer);
				authority.signal.removeEventListener('abort', done);
				resolve();
			};
			const timer = setTimeout(done, 150);
			authority.signal.addEventListener('abort', done, { once: true });
			if (authority.signal.aborted) done();
		});
		let revision = -1;
		const previousTurns = new Map<string, string>();
		for await (const frame of conversations.watch(identity.selectionKey, authority)) {
			if (frame.revision !== revision) {
				revision = frame.revision;
				const updates = frame.turns.filter((turn) => {
					const serialized = JSON.stringify(turn);
					if (previousTurns.get(turn.id) === serialized) return false;
					previousTurns.set(turn.id, serialized);
					return true;
				});
				yield* snapshot(
					conversations.page(identity.selectionKey, null, authority),
					'fresh',
					updates,
				);
			}
			if (frame.turns.every((turn) => turn.status !== 'running')) break;
		}
		yield { identity, sequence: resultSequence, channel: 'result', kind: 'complete' };
	}
	return new Response(
		createStreamedRendererFrameStream(frames(), { signal: authority.signal, timeoutMs: 10_000 }),
		{
			headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'private, no-store' },
		},
	);
}
