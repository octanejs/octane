// Barrel mirroring @xstate/react@6.1.0 src/index.ts
// (statelyai/xstate @ d4f8c5b709291d44f70139a7f9ff333abd7c615c).
//
// The framework-agnostic `xstate` core is NOT re-exported here, exactly as
// upstream does not re-export it: consumers import machines, actors, and logic
// creators straight from `xstate`, which this package takes as a peer.
export { createActorContext } from './createActorContext.ts';
export { shallowEqual } from './shallowEqual.ts';
export { useActor } from './useActor.ts';
export { useActorRef } from './useActorRef.ts';
export { useSelector } from './useSelector.ts';

// deprecated
export { useMachine } from './useMachine.ts';
