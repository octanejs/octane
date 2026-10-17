import { formatClientError } from '../error-codes.client.generated.js';
import type { ScopeImpl } from './engine.js';
import { encodeSignalValue } from './encoding.js';
import { assertAlive, ScopeDisposedError, SignalFrameError } from './errors.js';
import type { ScopedNode, SignalReadMode } from './graph.js';
import { isNativeAdoptionMiss, type NativeSerializedScope } from './read-protocol.js';
import { graphBridge } from './transition-state.js';
import type { SignalSeedEntry } from './types.js';

// Kept out of native-read-seeds.ts, which every hydrating client imports. It
// reaches the graph through its registration, not graph.ts: the server read
// driver supplies serializeScopeRead (native-read-server.ts), and importing the
// graph there would load it on every server render, in applications that never
// create a signal.

/** One node's seed entry, for serialization and native-read handoff. */
export function scopeSeedEntry(
	scope: ScopeImpl,
	node: ScopedNode,
	read: SignalReadMode = 'value',
): SignalSeedEntry | undefined {
	const current = node.state?.snapshot;
	if (
		current?.status === 'error' &&
		(current.error instanceof ScopeDisposedError ||
			current.error instanceof SignalFrameError ||
			isNativeAdoptionMiss(current.error))
	) {
		throw current.error;
	}
	const presented =
		read === 'latest' && node.state?.snapshot.status !== 'ready' ? node.lastState : node.state;
	// A producer's cancellation callback may serialize before graph teardown.
	// Only still-live inputs may be copied into a new historical handoff.
	if (presented?.owners) for (const owner of presented.owners) assertAlive(owner);
	const snapshot = presented?.snapshot;
	if (snapshot?.status !== 'ready') {
		if (read !== 'latest') return undefined;
		return {
			key: node.key,
			kind: node.kind,
			read,
			available: false,
			value: ['undefined'],
			complete: false,
		};
	}
	const request = scope.resources?.get(node)?.seedRequest(read === 'latest');
	if (node.kind === 'async' && !request) return undefined;
	return {
		key: node.key,
		kind: node.kind,
		...(read !== 'value' ? { read } : {}),
		value: encodeSignalValue(snapshot.value),
		complete: snapshot.complete,
		refreshing: snapshot.refreshing,
		connection: snapshot.connection,
		...(request ? { request } : {}),
	};
}

/** Serialize an observed ready subgraph, without evaluating anything new. */
export function serializeScopeRead(
	root: ScopedNode,
	read: SignalReadMode,
): readonly NativeSerializedScope[] | undefined {
	const scope = root.owner as ScopeImpl;
	if (!scope.seedable) return [];
	const rootEntry = scopeSeedEntry(scope, root, read);
	// A snapshot renders a pending or failed state as it is, without suspending.
	// The client resolves that state itself, or takes the stream's delivery, so
	// the read carries no seed rather than an invented ready one. Any other
	// unready read completed by mistake.
	if (!rootEntry)
		return read === 'snapshot' && root.state?.snapshot.status !== 'ready' ? [] : undefined;
	const owners = new Map<ScopeImpl, SignalSeedEntry[]>();
	const keys = new Map<string, ScopeImpl>();
	const seen = new Set<ScopedNode>();
	const pending = [root];
	while (pending.length) {
		const node = pending.pop()!;
		if (seen.has(node)) continue;
		seen.add(node);
		const owner = node.owner as ScopeImpl;
		graphBridge.assertAlive(owner);
		if (!owner.seedable) continue;
		const other = keys.get(owner.scopeKey);
		if (other && other !== owner) {
			throw new SignalFrameError(formatClientError(141));
		}
		keys.set(owner.scopeKey, owner);
		const entry = node === root ? rootEntry : scopeSeedEntry(owner, node);
		if (entry) {
			let entries = owners.get(owner);
			if (!entries) owners.set(owner, (entries = []));
			entries.push(entry);
		}
		for (let link = node.deps; link; link = link.nextDep) {
			if (link.dep instanceof graphBridge.ScopedNode) pending.push(link.dep);
		}
	}
	return [...owners].map(([owner, entries]) => ({
		owner,
		seed: { version: 1, scopeKey: owner.scopeKey, entries },
	}));
}
