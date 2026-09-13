import { hydrateRoot, type Root } from 'octane';
import { createScope, runWithSignalOwner, type SignalOwner } from 'octane/signals';
import {
	createStreamedRegionReceiver,
	decodeSignalValue,
	readStreamedRendererResponse,
	type StreamFrameIdentity,
} from 'octane/hydration';
import { installSignalDocumentLifecycle } from 'octane/hydration/streamed-signals';
import { readConversationPage } from '../conversation/Calls.tsrx';
import type { ConversationTurn } from '../conversation/operations.ts';
import { history$, isHistoryModel, selected$, status$, type HistoryModel } from './State.tsrx';

export function mountHistoryController(host: HTMLElement, documentOwner: SignalOwner) {
	const data = JSON.parse(document.getElementById('__octane_data')?.textContent || 'null');
	if (!data?.streamedSignals || data.clientBuild?.buildId !== data.streamedSignals.buildId)
		throw new Error('Missing executing document identity');
	const { buildId, documentId } = data.streamedSignals as { buildId: string; documentId: string };
	const owner = createScope({ scopeKey: 'history:' + documentId });
	let receiver = createStreamedRegionReceiver({ buildId, documentId, ownerKey: owner.scopeKey });
	const start = document.createComment('[');
	const end = document.createComment(']');
	host.replaceChildren(start, end);
	let root: Root | undefined;
	let active = false;
	let disposed = false;
	let generation = 0;
	let selection: StreamFrameIdentity | undefined;
	let pending: AbortController | undefined;
	let latest: HistoryModel | undefined;
	let detach: (() => void) | undefined;
	let unregister: (() => void) | undefined;
	let activating: Promise<void> | undefined;
	let paging = false;
	let pageRequest: AbortController | undefined;
	let frozen = false;
	let complete = false;
	let resumeSelection = false;
	let resumePage = false;
	let olderTurns: ConversationTurn[] = [];
	let olderCursor: string | null | undefined;
	const lifecycle = installSignalDocumentLifecycle({
		document,
		buildId,
		documentId,
		signalOwner: owner,
	});
	const styles = new Map<string, Promise<void>>();
	const status = (message: string) => runWithSignalOwner(documentOwner, () => status$.set(message));
	const publish = (model: HistoryModel) => runWithSignalOwner(owner, () => history$.set(model));
	function loadStyles(urls: readonly string[]) {
		return Promise.all(
			urls.map((href) => {
				const url = new URL(href, location.href);
				if (url.origin !== location.origin || url.protocol !== location.protocol)
					throw new Error('Incompatible region stylesheet identity');
				let promise = styles.get(url.href);
				if (promise === undefined) {
					promise = new Promise<void>((resolve, reject) => {
						const existing = [
							...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
						].find((link) => link.href === url.href);
						if (existing?.sheet) {
							resolve();
							return;
						}
						const link = existing ?? document.createElement('link');
						const loaded = () => {
							cleanup();
							resolve();
						};
						const failed = () => {
							cleanup();
							reject(new Error('History styles failed'));
						};
						const cleanup = () => {
							link.removeEventListener('load', loaded);
							link.removeEventListener('error', failed);
						};
						link.addEventListener('load', loaded, { once: true });
						link.addEventListener('error', failed, { once: true });
						if (!existing) {
							link.rel = 'stylesheet';
							link.href = url.href;
							document.head.append(link);
						}
					});
					styles.set(url.href, promise);
				}
				return promise;
			}),
		).then(() => {});
	}
	async function select(id: 'A' | 'B', restoring = false) {
		if (disposed || frozen) return;
		const retainedRevision = restoring ? (latest?.revision ?? 0) : 0;
		// Results can lead HTML while required styles load. Only HTML already
		// presented in this dormant range establishes its placement floor.
		const presentedRevision = restoring
			? (host.querySelector('[data-history]')?.getAttribute('data-revision') ?? null)
			: null;
		const contentRevision = presentedRevision === null ? 0 : Number(presentedRevision) + 1;
		let resultComplete = false;
		const identity: StreamFrameIdentity = {
			protocol: 1,
			buildId,
			documentId,
			ownerKey: owner.scopeKey,
			instanceKey: 'history',
			nodeKey: 'model',
			selectionKey: id,
			selectionGeneration: ++generation,
			attempt: 0,
		};
		selection = identity;
		detach?.();
		unregister?.();
		receiver.registerSelection(identity, contentRevision);
		pending?.abort();
		const request = (pending = new AbortController());
		complete = false;
		if (!restoring) {
			latest = undefined;
			olderTurns = [];
			olderCursor = undefined;
		}
		pageRequest?.abort();
		runWithSignalOwner(documentOwner, () => selected$.set(id));
		status('Loading history');
		detach = receiver.attachResult(identity, {
			accept(frame) {
				if (disposed || frozen || selection !== identity) return;
				if (frame.kind === 'value') {
					const model = decodeSignalValue(frame.value);
					if (!isHistoryModel(model) || model.conversationId !== id)
						throw new Error('Incompatible history result');
					// Restoring a selected read can replay an older host cache. The
					// retained completed content stays visible until it catches up.
					if (model.revision < retainedRevision) return;
					if (latest !== undefined && model.revision < latest.revision)
						throw new Error('History revision regressed');
					if (olderCursor !== undefined) {
						const newest = new Set(model.turns.map((turn) => turn.id));
						const updates = new Map(model.updates.map((turn) => [turn.id, turn]));
						olderTurns = (latest?.turns ?? olderTurns)
							.filter((turn) => !newest.has(turn.id))
							.map((turn) => updates.get(turn.id) ?? turn);
					}
					latest = {
						...model,
						turns: [...olderTurns, ...model.turns],
						nextCursor: olderCursor === undefined ? model.nextCursor : olderCursor,
					};
					publish(latest);
					status(model.source === 'cached' ? 'Showing cached history' : 'Showing fresh history');
				} else if (frame.kind === 'complete') {
					resultComplete = true;
				} else if (frame.kind === 'error') status('History unavailable');
			},
			fail() {
				if (!disposed && selection === identity) status('History unavailable');
			},
		});
		if (!active)
			unregister = receiver.registerRegion({
				identity,
				start,
				end,
				contentRevision,
				isActive: () => active || disposed,
				loadStyles,
				adoptHistoricalFrame: (seed) => owner.beginAdoption(seed),
			});
		const query = new URLSearchParams({
			build: buildId,
			document: documentId,
			generation: String(generation),
			conversation: id,
		});
		const operation = new URL(location.href).searchParams.get('operation');
		if (operation !== null) query.set('operation', operation);
		try {
			const response = await fetch(
				new URL('/conversation-history/frames?' + query, location.href),
				{ signal: request.signal },
			);
			if (!response.ok) throw new Error('History request failed');
			await readStreamedRendererResponse(response, receiver, {
				signal: request.signal,
				timeoutMs: 10_000,
			});
			if (
				!disposed &&
				!frozen &&
				selection === identity &&
				!request.signal.aborted &&
				resultComplete
			) {
				// A result terminal does not complete a placement still waiting for
				// CSS. Freeze must restart that unfinished selected delivery too.
				complete = true;
				status('History complete');
			}
		} catch (error) {
			if (!disposed && selection === identity && !request.signal.aborted) {
				status('History unavailable');
				throw error;
			}
		}
	}
	function activate(): Promise<void> {
		if (activating !== undefined) return activating;
		activating = (async () => {
			const { History } = await import('./History.tsrx');
			if (
				disposed ||
				frozen ||
				active ||
				latest === undefined ||
				!host.querySelector('[data-history]')
			)
				return;
			// Retire only the placement envelope. The component's own emitted
			// markers, styles, native seed and DOM remain exactly where they were.
			active = true;
			start.remove();
			end.remove();
			root = hydrateRoot(host, History, {}, { signalOwner: owner });
			publish(latest);
			status('History active');
		})().finally(() => {
			activating = undefined;
		});
		return activating;
	}
	async function older() {
		if (paging || disposed || frozen || !selection || !latest?.nextCursor) return;
		paging = true;
		const request = (pageRequest = new AbortController());
		const identity = selection;
		const cursor = latest.nextCursor;
		try {
			// A promise result means the finite page completed; no cursor is
			// manufactured from a partial watch snapshot.
			const page = await readConversationPage(identity.selectionKey, cursor, {
				signal: request.signal,
			});
			if (disposed || frozen || selection !== identity || !latest) return;
			await activate();
			if (disposed || frozen || selection !== identity || !latest) return;
			const seen = new Set(latest.turns.map((turn) => turn.id));
			latest = {
				...latest,
				turns: [...page.turns.filter((turn) => !seen.has(turn.id)), ...latest.turns],
				nextCursor: page.nextCursor,
			};
			olderTurns = latest.turns;
			olderCursor = page.nextCursor;
			publish(latest);
			status(page.nextCursor === null ? 'All history loaded' : 'Older page loaded');
		} catch (error) {
			if (!request.signal.aborted && !disposed) throw error;
		} finally {
			if (pageRequest === request) paging = false;
		}
	}
	function hide(event: PageTransitionEvent) {
		if (!event.persisted) {
			dispose();
			return;
		}
		if (disposed || frozen) return;
		frozen = true;
		resumeSelection = !complete;
		resumePage = paging;
		pending?.abort();
		pageRequest?.abort();
		detach?.();
		unregister?.();
		receiver.dispose();
	}
	function show(event: PageTransitionEvent) {
		if (!event.persisted || !frozen || disposed) return;
		void lifecycle.whenActive().then((compatible) => {
			if (disposed || !frozen) return;
			if (!compatible) {
				dispose();
				return;
			}
			frozen = false;
			receiver = createStreamedRegionReceiver({ buildId, documentId, ownerKey: owner.scopeKey });
			if (resumeSelection && selection)
				void select(selection.selectionKey as 'A' | 'B', true).catch(() => {});
			if (resumePage) {
				paging = false;
				void older().catch(() => {});
			}
		});
	}
	window.addEventListener('pagehide', hide);
	window.addEventListener('pageshow', show);
	function dispose() {
		if (disposed) return;
		disposed = true;
		window.removeEventListener('pagehide', hide);
		window.removeEventListener('pageshow', show);
		pending?.abort();
		pageRequest?.abort();
		detach?.();
		unregister?.();
		receiver.dispose();
		root?.unmount();
		lifecycle.dispose();
		styles.clear();
	}
	void select('A').catch(() => {});
	return { select, activate, older, dispose };
}

export type HistoryController = ReturnType<typeof mountHistoryController>;
