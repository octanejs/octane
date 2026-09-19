import type { NativeTransitionPresentation } from './read-protocol.js';
import type { SignalActionFrame } from './transition-action.js';

/** Concrete host objects stay typed without making the model import a renderer. */
export interface SignalTransitionTypes {
	Block: SignalTransitionBlock<this>;
	Owner: SignalTransitionOwner<this>;
	Transaction: SignalTransitionTransaction<this>;
	Attempt: SignalTransitionAttempt<this>;
	Update: SignalTransitionUpdate<this>;
	Hook: SignalTransitionHook<this>;
	Batch: SignalTransitionBatch<this>;
	Boundary: SignalTransitionBoundary<this>;
	Thenable: PromiseLike<unknown>;
	Suspense: SignalTransitionSuspense<this>;
	Capture: object;
	RootFrame: object;
	MemoSwap: object;
	Value: unknown;
}

interface SignalTransitionAttempt<T extends SignalTransitionTypes> {
	memoSwaps: T['MemoSwap'][] | null;
}

interface SignalTransitionHook<T extends SignalTransitionTypes> {
	block: T['Block'];
	pendingBatches: number;
	isPending: boolean;
}

interface SignalTransitionSuspense<T extends SignalTransitionTypes> {
	readonly thenable: T['Thenable'];
}

interface SignalTransitionBlock<T extends SignalTransitionTypes> {
	disposed: boolean;
	parentBlock: T['Block'] | null;
	idState: { renderOwner?: T['Owner'] };
	pendingMode: 'urgent' | 'transition' | null;
	inactive: boolean;
}

interface SignalTransitionOwner<T extends SignalTransitionTypes> {
	disposed: boolean;
	transaction: T['Transaction'] | null;
	nativeTransitions?: Set<T['Batch']>;
}

interface SignalTransitionTransaction<T extends SignalTransitionTypes> {
	owner: T['Owner'];
	capture: T['Capture'];
	retired: Set<T['Block']> | null;
	aborted: boolean;
	nativeAdmitted?: boolean;
}

interface SignalTransitionUpdate<T extends SignalTransitionTypes> {
	block: T['Block'];
	slot: {
		value: T['Value'];
		pendingActionBatch?: T['Batch'];
		pendingActionValue?: T['Value'];
	};
	state?: { renderTransition?: T['Update']; updates?: unknown };
	reducer?: { renderTransition?: T['Update']; renderPhaseActions?: unknown };
}

interface SignalTransitionBatch<T extends SignalTransitionTypes> {
	updates: Map<object, T['Update']>;
	flushed: boolean;
	hook: T['Hook'] | null;
	hooks: T['Hook'][] | null;
	hooksPending: boolean;
	native?: SignalActionFrame;
	nativeWake?: () => void;
	nativeBlocks?: Set<T['Block']>;
	nativeBoundaries?: Map<T['Boundary'], T['Thenable']>;
}

interface SignalTransitionBoundary<T extends SignalTransitionTypes> {
	tryBlock: T['Block'] | null;
	parentBlock: T['Block'];
	nativeTransition?: T['Batch'];
	transitionTimeoutId: ReturnType<typeof setTimeout> | null;
	hasResolved: boolean;
	branch: -1 | 0 | 1 | 2;
	pendingBody: object | null;
}

export interface NativeTransitionAttempt<T extends SignalTransitionTypes> {
	blocks: Set<T['Block']>;
	transactions: Set<T['Transaction']>;
	attempts: T['Attempt'][];
	presentations: NativeTransitionPresentation[];
	suspensions: Map<T['Boundary'], T['Thenable']>;
	errorBlock?: T['Block'];
}

/** The optional coordinator reuses the renderer's journals and commit wave. */
export interface SignalTransitionRuntime<T extends SignalTransitionTypes> {
	attempt: NativeTransitionAttempt<T> | null;
	readonly visibility: {
		find(block: T['Block'], climbResolved: boolean): T['Boundary'] | null;
		reveal(boundary: T['Boundary'], mode: 'urgent' | 'transition'): void;
		hidePending(boundary: T['Boundary']): void;
	} | null;
	readonly rollback: boolean;
	readonly fallbackTimeout: number;
	schedule(): void;
	beginRoot(owner: T['Owner'] | undefined): T['RootFrame'] | null;
	endRoot(frame: T['RootFrame'] | null): void;
	beginAttempt(block: T['Block']): T['Attempt'] | null;
	endAttempt(attempt: T['Attempt'] | null): void;
	invalidate(block: T['Block'], owner: T['Block']): void;
	render(block: T['Block']): void;
	journal(value: object): void;
	journalProperty(value: object, key: PropertyKey, previous: unknown): void;
	isSuspense(error: unknown): error is T['Suspense'];
	releaseHookHolder(holder: object): void;
	rebaseUpdate(update: T['Update']): T['Value'];
	flushBatch(batch: T['Batch']): void;
	currentPresentations(capture: T['Capture']): boolean;
	validateCapture(capture: T['Capture']): boolean;
	acceptCapture(capture: T['Capture'], owner: T['Owner'], replayRefs: boolean): boolean;
	commitRoots(): void;
	rollbackRoot(transaction: T['Transaction']): void;
	applyMemoSwap(swap: T['MemoSwap'], forward: boolean): void;
	handleError(block: T['Block'], error: unknown): void;
	reportError(error: unknown, hook?: T['Hook']): void;
	unsupportedError(): TypeError;
}

export interface SignalTransitionCoordinator<T extends SignalTransitionTypes> {
	queue(batch: T['Batch']): void;
	flush(): void;
	prepare(block: T['Block']): void;
	retire(block: T['Block']): void;
	hasWork(): boolean;
}

export type SignalTransitionCoordinatorFactory = <T extends SignalTransitionTypes>(
	runtime: SignalTransitionRuntime<T>,
) => SignalTransitionCoordinator<T>;

/** Registered by the model entry, with no runtime import or ordinary-render allocation. */
export function createSignalTransitionCoordinator<T extends SignalTransitionTypes>(
	runtime: SignalTransitionRuntime<T>,
): SignalTransitionCoordinator<T> {
	type Block = T['Block'];
	type TransitionActionBatch = T['Batch'];
	type TransitionHookSlot = T['Hook'];
	let NATIVE_TRANSITION_QUEUE: Set<TransitionActionBatch> | null = null;

	function queueNativeTransition(batch: TransitionActionBatch): void {
		(NATIVE_TRANSITION_QUEUE ??= new Set()).add(batch);
		runtime.schedule();
	}

	/** The graph calls only tagged presentation readers, never subscriber callbacks. */
	function prepareNativeTransitionBlock(block: Block): void {
		const admission = runtime.attempt!;
		if (block.disposed || admission.blocks.has(block)) return;
		const hidden = runtime.visibility?.find(block, false);
		if (hidden?.nativeTransition !== undefined && hidden.tryBlock !== null) block = hidden.tryBlock;
		if (admission.blocks.has(block)) return;
		const owner = block.idState.renderOwner;
		if (owner === undefined || owner.disposed) return;
		const retired = owner.transaction?.retired;
		if (retired !== undefined && retired !== null)
			for (let current: Block | null = block; current !== null; current = current.parentBlock)
				if (retired.has(current)) return;
		admission.blocks.add(block);
		const root = runtime.beginRoot(owner);
		admission.transactions.add(owner.transaction!);
		const mode = block.pendingMode;
		block.pendingMode = 'transition';
		const attempt = runtime.beginAttempt(block);
		if (attempt !== null) admission.attempts.push(attempt);
		try {
			runtime.invalidate(block, block);
			if (hidden?.nativeTransition !== undefined) {
				runtime.journal(hidden);
				runtime.journalProperty(block, 'inactive', block.inactive);
				runtime.visibility!.reveal(hidden, 'transition');
			} else runtime.render(block);
		} catch (error) {
			if (runtime.isSuspense(error)) {
				// Independent consumers enter below their boundary's render catch.
				// Route only to the real boundary to retain its configured timeout.
				for (let owner: Block | null = block; owner !== null; owner = owner.parentBlock) {
					const handler = (owner as any).__suspenseHandler;
					if (handler) {
						try {
							handler(error.thenable, block);
						} catch (suspension) {
							if (!runtime.isSuspense(suspension)) throw suspension;
						}
						break;
					}
				}
				throw error.thenable;
			}
			admission.errorBlock ??= block;
			throw error;
		} finally {
			runtime.endAttempt(attempt);
			block.pendingMode = mode;
			runtime.endRoot(root);
		}
	}

	function finishNativeTransition(batch: TransitionActionBatch): void {
		batch.nativeWake?.();
		batch.nativeWake = undefined;
		batch.native = undefined;
		for (const block of batch.nativeBlocks ?? [])
			block.idState.renderOwner?.nativeTransitions?.delete(batch);
		batch.nativeBlocks = undefined;
		for (const state of batch.nativeBoundaries?.keys() ?? []) {
			if (state.nativeTransition !== batch) continue;
			state.nativeTransition = undefined;
			if (state.transitionTimeoutId !== null) {
				clearTimeout(state.transitionTimeoutId);
				state.transitionTimeoutId = null;
			}
		}
		batch.nativeBoundaries = undefined;
		NATIVE_TRANSITION_QUEUE?.delete(batch);
		if (NATIVE_TRANSITION_QUEUE?.size === 0) NATIVE_TRANSITION_QUEUE = null;
		runtime.releaseHookHolder(batch);
	}

	function retireNativeTransitionBlock(block: Block): void {
		if (runtime.rollback) return;
		for (const batch of block.idState.renderOwner?.nativeTransitions ?? []) {
			if (!batch.nativeBlocks?.has(block)) continue;
			// Retiring demand revokes that presentation, not the model write. The
			// next preparation discovers only the surviving subscriber frontier.
			queueNativeTransition(batch);
		}
	}

	function prepareNativeTransitionUpdates(batch: TransitionActionBatch): void {
		for (const update of batch.updates.values()) {
			const { block, slot, state, reducer } = update;
			const owner = block.idState.renderOwner;
			if (block.disposed || owner === undefined || owner.disposed) continue;
			const frame = runtime.beginRoot(owner);
			runtime.attempt!.transactions.add(owner.transaction!);
			try {
				runtime.journal(slot);
				if (state !== undefined) {
					state.renderTransition = update;
					state.updates = undefined;
				} else if (reducer !== undefined) {
					reducer.renderTransition = update;
					reducer.renderPhaseActions = undefined;
				} else slot.value = runtime.rebaseUpdate(update);
				if (slot.pendingActionBatch === batch) {
					slot.pendingActionBatch = undefined;
					slot.pendingActionValue = undefined;
				}
			} finally {
				runtime.endRoot(frame);
			}
		}
	}

	function prepareNativeTransitionHook(
		batch: TransitionActionBatch,
		hook: TransitionHookSlot,
	): void {
		const owner = hook.block.idState.renderOwner;
		if (hook.block.disposed || owner === undefined || owner.disposed) return;
		const frame = runtime.beginRoot(owner);
		runtime.attempt!.transactions.add(owner.transaction!);
		try {
			if (batch.hooksPending && hook.pendingBatches === 1) {
				runtime.journal(hook);
				hook.isPending = false;
			}
		} finally {
			runtime.endRoot(frame);
		}
		prepareNativeTransitionBlock(hook.block);
	}

	/** Native candidates share the existing root journals and scheduler commit wave. */
	function flushNativeTransitions(): void {
		const queue = NATIVE_TRANSITION_QUEUE;
		if (queue === null) return;
		NATIVE_TRANSITION_QUEUE = null;
		for (const batch of queue) {
			const candidate = batch.native;
			if (candidate === undefined) continue;
			batch.nativeWake?.();
			batch.nativeWake = undefined;
			try {
				if (!candidate.validate()) candidate.rebase();
			} catch {
				candidate.discard();
				finishNativeTransition(batch);
				runtime.flushBatch(batch);
				continue;
			}
			if (!candidate.hasWrites()) {
				candidate.discard();
				finishNativeTransition(batch);
				runtime.flushBatch(batch);
				continue;
			}
			const admission: NativeTransitionAttempt<T> = {
				blocks: new Set(),
				transactions: new Set(),
				attempts: [],
				presentations: [],
				suspensions: new Map(),
			};
			runtime.attempt = admission;
			let outcome;
			try {
				outcome = candidate.prepare([
					() => prepareNativeTransitionUpdates(batch),
					...(batch.hook === null ? [] : [() => prepareNativeTransitionHook(batch, batch.hook!)]),
					...(batch.hooks ?? []).map((hook) => () => prepareNativeTransitionHook(batch, hook)),
					...[...batch.updates.values()].map(
						(update) => () => prepareNativeTransitionBlock(update.block),
					),
					...candidate
						.consumers()
						.filter((consumer) => consumer.active())
						.map((consumer) => () => {
							const presentation = consumer.prepare();
							if (presentation !== undefined) admission.presentations.push(presentation);
						}),
				]);
			} finally {
				runtime.attempt = null;
			}
			for (const block of batch.nativeBlocks ?? [])
				block.idState.renderOwner?.nativeTransitions?.delete(batch);
			batch.nativeBlocks = admission.blocks;
			for (const transaction of admission.transactions)
				(transaction.owner.nativeTransitions ??= new Set()).add(batch);
			const valid =
				outcome.status === 'ready' &&
				admission.presentations.every((presentation) => presentation.validate()) &&
				[...admission.transactions].every(
					(transaction) =>
						!transaction.aborted &&
						!transaction.owner.disposed &&
						runtime.currentPresentations(transaction.capture) &&
						runtime.validateCapture(transaction.capture),
				);
			if (
				valid &&
				outcome.status === 'ready' &&
				outcome.receipt.publish(() => {
					// All accepted subscriptions transfer before a public subscriber runs.
					for (const transaction of admission.transactions) {
						transaction.nativeAdmitted = true;
						runtime.acceptCapture(transaction.capture, transaction.owner, true);
					}
					batch.flushed = true;
					batch.updates.clear();
					finishNativeTransition(batch);
					for (const presentation of admission.presentations) presentation.commit();
					runtime.commitRoots();
				})
			) {
				continue;
			}
			for (const transaction of admission.transactions) runtime.rollbackRoot(transaction);
			for (const presentation of admission.presentations) presentation.discard();
			for (let i = admission.attempts.length - 1; i >= 0; i--) {
				const swaps = admission.attempts[i].memoSwaps;
				if (swaps !== null)
					for (let j = swaps.length - 1; j >= 0; j--) runtime.applyMemoSwap(swaps[j], false);
			}
			runtime.commitRoots();
			if (outcome.status === 'pending') {
				for (const state of batch.nativeBoundaries?.keys() ?? []) {
					if (admission.suspensions.has(state)) continue;
					if (state.nativeTransition === batch) state.nativeTransition = undefined;
					if (state.transitionTimeoutId !== null) {
						clearTimeout(state.transitionTimeoutId);
						state.transitionTimeoutId = null;
					}
				}
				for (const [state, thenable] of admission.suspensions) {
					state.nativeTransition = batch;
					if (
						state.hasResolved &&
						state.branch === 1 &&
						state.pendingBody !== null &&
						runtime.fallbackTimeout !== Infinity &&
						runtime.fallbackTimeout >= 0 &&
						(state.transitionTimeoutId === null || batch.nativeBoundaries?.get(state) !== thenable)
					) {
						if (state.transitionTimeoutId !== null) clearTimeout(state.transitionTimeoutId);
						state.transitionTimeoutId = setTimeout(() => {
							state.transitionTimeoutId = null;
							if (
								state.nativeTransition === batch &&
								!state.parentBlock.disposed &&
								state.branch === 1
							)
								runtime.visibility!.hidePending(state);
						}, runtime.fallbackTimeout);
					}
				}
				batch.nativeBoundaries = admission.suspensions;
				batch.nativeWake = candidate.watchPreparation(outcome, () => queueNativeTransition(batch));
			} else if (
				outcome.status === 'ready' ||
				(outcome.status === 'invalid' && outcome.reason === 'stale')
			) {
				queueNativeTransition(batch);
			} else {
				candidate.discard();
				finishNativeTransition(batch);
				for (const update of batch.updates.values()) {
					if (update.slot.pendingActionBatch === batch) {
						update.slot.pendingActionBatch = undefined;
						update.slot.pendingActionValue = undefined;
					}
				}
				batch.updates.clear();
				batch.flushed = true;
				if (outcome.status === 'error') {
					if (admission.errorBlock !== undefined && !admission.errorBlock.disposed)
						runtime.handleError(admission.errorBlock, outcome.error);
					else runtime.reportError(outcome.error, batch.hook ?? undefined);
				} else if (outcome.status === 'invalid')
					runtime.reportError(runtime.unsupportedError(), batch.hook ?? undefined);
			}
		}
	}

	return {
		queue: queueNativeTransition,
		flush: flushNativeTransitions,
		prepare: prepareNativeTransitionBlock,
		retire: retireNativeTransitionBlock,
		hasWork: () => NATIVE_TRANSITION_QUEUE !== null,
	};
}
