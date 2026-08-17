import type { AnyActorRef } from 'xstate';

function forEachActor(actorRef: AnyActorRef, callback: (actor: AnyActorRef) => void) {
	callback(actorRef);
	const children = actorRef.getSnapshot().children as Record<string, AnyActorRef> | undefined;
	if (children) {
		for (const child of Object.values(children)) forEachActor(child, callback);
	}
}

export function stopRootWithRehydration(actorRef: AnyActorRef) {
	const persistedSnapshots: Array<[AnyActorRef, unknown]> = [];
	forEachActor(actorRef, (ref) => {
		persistedSnapshots.push([ref, ref.getSnapshot()]);
		(ref as any).observers = new Set();
	});
	const systemSnapshot = (actorRef.system as any).getSnapshot?.();
	actorRef.stop();
	(actorRef.system as any)._snapshot = systemSnapshot;
	for (const [ref, snapshot] of persistedSnapshots) {
		(ref as any)._processingStatus = 0;
		(ref as any)._snapshot = snapshot;
	}
}
