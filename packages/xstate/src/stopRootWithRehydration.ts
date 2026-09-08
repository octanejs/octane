// Ported verbatim from @xstate/react@6.1.0 src/stopRootWithRehydration.ts
// (statelyai/xstate @ d4f8c5b709291d44f70139a7f9ff333abd7c615c). It touches only
// xstate internals — no React or Octane surface — so the upstream implementation
// is the port.
//
// Upstream's motivating case (React Strict Effects double-invoking the
// start/stop effect) does not exist on Octane, which never double-invokes
// effects. The behavior is retained regardless because it also governs a real
// unmount followed by a remount: the actor tree is persisted and rehydrated
// rather than cold-restarted, which is observable to consumers and is what the
// pinned upstream release does.
import { AnyActorRef, Snapshot } from 'xstate';

const forEachActor = (actorRef: AnyActorRef, callback: (ref: AnyActorRef) => void) => {
	callback(actorRef);
	const children = actorRef.getSnapshot().children;
	if (children) {
		Object.values(children).forEach((child) => {
			forEachActor(child as AnyActorRef, callback);
		});
	}
};

export function stopRootWithRehydration(actorRef: AnyActorRef) {
	// persist snapshot here in a custom way allows us to persist inline actors and to preserve actor references
	// we do it to avoid setState in useEffect when the effect gets "reconnected"
	// this currently only happens in Strict Effects but it simulates the Offscreen aka Activity API
	// it also just allows us to end up with a somewhat more predictable behavior for the users
	const persistedSnapshots: Array<[AnyActorRef, Snapshot<unknown>]> = [];
	forEachActor(actorRef, (ref) => {
		persistedSnapshots.push([ref, ref.getSnapshot()]);
		// muting observers allow us to avoid `useSelector` from being notified about the stopped snapshot
		// React reconnects its subscribers (from the useSyncExternalStore) on its own
		// and userland subscribers should basically always do the same anyway
		// as each subscription should have its own cleanup logic and that should be called each such reconnect
		(ref as any).observers = new Set();
	});
	const systemSnapshot = actorRef.system.getSnapshot?.();

	actorRef.stop();

	(actorRef.system as any)._snapshot = systemSnapshot;
	persistedSnapshots.forEach(([ref, snapshot]) => {
		(ref as any)._processingStatus = 0;
		(ref as any)._snapshot = snapshot;
	});
}
