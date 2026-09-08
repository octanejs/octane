// This fragment is inserted into the exact pinned React DOM client closure.
// It is an experiment, not a supported React API or a general transaction API.
var __octaneCreatedRoots = new WeakSet();
var __octaneCommitGates = new WeakMap();
var __octaneCommitTokens = new WeakMap();
var __octaneNextCommitId = 0;

function __octaneTrackCreatedRoot(publicRoot) {
	__octaneCreatedRoots.add(publicRoot);
	return publicRoot;
}

function __octaneRequireIdle() {
	// The pinned renderer defines RenderContext=2 and CommitContext=4.
	if ((executionContext & 6) !== 0) {
		throw new Error('Commit-gate operations cannot run during React render/commit.');
	}
}

function __octaneFinishToken(token, record, status, reason) {
	if (record.status !== 'held' && record.status !== 'committing') return;
	var gate = record.gate;
	record.status = status;
	if (gate !== null && gate.pending === token) gate.pending = null;
	// A retained terminal token must not retain the Fiber candidate or its root.
	record.root = record.args = record.baseCurrent = record.gate = record.cancel = null;
	if (status === 'aborted' && gate !== null && gate.onAborted !== null) {
		var notify = gate.onAborted;
		queueMicrotask(function () {
			notify(token, reason);
		});
	}
}

function __octaneTokenIsCurrent(token, record) {
	return (
		record !== undefined &&
		record.status === 'held' &&
		record.gate.active &&
		record.gate.pending === token &&
		record.gate.publicRoot._internalRoot === record.root &&
		record.root.current === record.baseCurrent &&
		record.root.cancelPendingCommit === record.cancel
	);
}

function __octaneAbortToken(token, reason) {
	var record = __octaneCommitTokens.get(token);
	if (!__octaneTokenIsCurrent(token, record)) return false;
	__octaneRequireIdle();
	var root = record.root;
	var lanes = record.args[2];
	var spawnedLane = record.args[6];
	record.abortReason = reason;
	// Use React's existing cancellation path: it invokes record.cancel before
	// reusing the alternate Fiber. Dropping the callback alone is insufficient.
	prepareFreshStack(root, 0);
	markRootSuspended(root, lanes, spawnedLane, true);
	ensureRootIsScheduled(root);
	return true;
}

function __octaneAcceptToken(token) {
	var record = __octaneCommitTokens.get(token);
	if (!__octaneTokenIsCurrent(token, record)) return false;
	__octaneRequireIdle();
	// Keep cancellation installed while flushing older effects. A subscription
	// or effect can schedule newer work and invalidate this held candidate.
	do {
		flushPendingEffects();
	} while (pendingEffectsStatus !== 0);
	if (!__octaneTokenIsCurrent(token, record)) return false;
	// React only records these checks on certain render paths. This is a useful
	// recheck, NOT a claim of complete store consistency for held sync/hydration.
	if (!isRenderConsistentWithExternalStores(record.args[1])) {
		__octaneAbortToken(token, 'recorded-store-changed');
		return false;
	}
	var args = record.args;
	var gate = record.gate;
	record.status = 'committing';
	gate.pending = null;
	// One exact candidate bypasses the admission hook once. A recursive commit
	// produced by an effect does not inherit an unrestricted bypass.
	gate.bypassWork = args[1];
	try {
		commitRoot.apply(null, args);
		__octaneFinishToken(token, record, 'committed', null);
		return true;
	} catch (error) {
		__octaneFinishToken(token, record, 'failed', null);
		throw error;
	} finally {
		gate.bypassWork = null;
	}
}

function __octaneNewToken() {
	return Object.freeze({
		id: ++__octaneNextCommitId,
		get status() {
			return __octaneCommitTokens.get(this).status;
		},
		accept: function () {
			return __octaneAcceptToken(this);
		},
		abort: function () {
			return __octaneAbortToken(this, 'explicit-abort');
		},
	});
}

function __octaneMaybeHoldCommit(originalArgs) {
	var root = originalArgs[0];
	var gate = __octaneCommitGates.get(root);
	if (gate === undefined || !gate.active || originalArgs[1] === null) return false;
	// Public root.unmount() clears _internalRoot before scheduling its deletion.
	// Teardown must never become another externally held candidate.
	if (gate.publicRoot._internalRoot !== root) {
		gate.active = false;
		__octaneCommitGates.delete(root);
		return false;
	}
	if (gate.bypassWork === originalArgs[1]) {
		gate.bypassWork = null;
		return false;
	}
	if (gate.pending !== null) {
		var previous = __octaneCommitTokens.get(gate.pending);
		__octaneFinishToken(gate.pending, previous, 'aborted', 'replaced-before-commit');
	}
	var token = __octaneNewToken();
	var record = {
		status: 'held',
		root: root,
		baseCurrent: root.current,
		args: Array.prototype.slice.call(originalArgs),
		gate: gate,
		abortReason: 'react-invalidated',
		cancel: null,
	};
	record.cancel = function () {
		__octaneFinishToken(token, record, 'aborted', record.abortReason);
	};
	__octaneCommitTokens.set(token, record);
	gate.pending = token;
	root.cancelPendingCommit = record.cancel;
	// Native root scheduling recognizes cancelPendingCommit and suspends this
	// work. New updates use prepareFreshStack to cancel it before retrying.
	markRootSuspended(root, originalArgs[2], originalArgs[6], true);
	var notify = gate.onPrepared;
	queueMicrotask(function () {
		var latest = __octaneCommitTokens.get(token);
		if (__octaneTokenIsCurrent(token, latest)) notify(token);
	});
	return true;
}

function __octaneAttachCommitGate(publicRoot, options) {
	__octaneRequireIdle();
	if (!__octaneCreatedRoots.has(publicRoot)) {
		throw new Error('Use a fresh createRoot from this exact patched React DOM client.');
	}
	var root = publicRoot._internalRoot;
	if (
		root === null ||
		root.current.alternate !== null ||
		root.pendingLanes !== 0 ||
		root.current.memoizedState.isDehydrated
	) {
		throw new Error('Attach the commit gate before the first render; hydration is excluded.');
	}
	if (__octaneCommitGates.has(root)) throw new Error('Root already has a commit gate.');
	if (
		options === null ||
		typeof options !== 'object' ||
		typeof options.onPrepared !== 'function' ||
		(options.onAborted !== undefined && typeof options.onAborted !== 'function')
	) {
		throw new Error('Expected onPrepared and an optional onAborted callback.');
	}
	var gate = {
		active: true,
		publicRoot: publicRoot,
		pending: null,
		bypassWork: null,
		onPrepared: options.onPrepared,
		onAborted: options.onAborted || null,
	};
	__octaneCommitGates.set(root, gate);
	return Object.freeze({
		get pending() {
			return gate.pending;
		},
		dispose: function () {
			__octaneRequireIdle();
			if (!gate.active) return;
			try {
				publicRoot.unmount();
			} finally {
				gate.active = false;
				__octaneCommitGates.delete(root);
			}
		},
	});
}
