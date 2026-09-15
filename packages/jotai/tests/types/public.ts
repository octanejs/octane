import { expectTypeOf } from 'vitest';
import type { OctaneNode, JSX } from 'octane';
import * as port0 from '@octanejs/jotai';
import * as upstream0 from 'jotai';
import * as port1 from '@octanejs/jotai/vanilla';
import * as upstream1 from 'jotai/vanilla';
import * as port2 from '@octanejs/jotai/vanilla/utils';
import * as upstream2 from 'jotai/vanilla/utils';
import * as port3 from '@octanejs/jotai/vanilla/internals';
import * as upstream3 from 'jotai/vanilla/internals';
import * as port4 from '@octanejs/jotai/react';
import * as upstream4 from 'jotai/react';
import * as port5 from '@octanejs/jotai/react/utils';
import * as upstream5 from 'jotai/react/utils';
import * as port6 from '@octanejs/jotai/utils';
import * as upstream6 from 'jotai/utils';
expectTypeOf<typeof port0.atom>().toEqualTypeOf<typeof upstream0.atom>();
expectTypeOf<port0.Atom<number>>().toEqualTypeOf<upstream0.Atom<number>>();
expectTypeOf<port0.WritableAtom<number, [string], boolean>>().toEqualTypeOf<
	upstream0.WritableAtom<number, [string], boolean>
>();
expectTypeOf<port0.PrimitiveAtom<number>>().toEqualTypeOf<upstream0.PrimitiveAtom<number>>();
expectTypeOf<typeof port0.createStore>().toEqualTypeOf<typeof upstream0.createStore>();
expectTypeOf<typeof port0.getDefaultStore>().toEqualTypeOf<typeof upstream0.getDefaultStore>();
expectTypeOf<typeof port0.INTERNAL_overrideCreateStore>().toEqualTypeOf<
	typeof upstream0.INTERNAL_overrideCreateStore
>();
expectTypeOf<port0.Getter>().toEqualTypeOf<upstream0.Getter>();
expectTypeOf<port0.Setter>().toEqualTypeOf<upstream0.Setter>();
expectTypeOf<
	port0.ExtractAtomValue<upstream1.WritableAtom<number, [string], boolean>>
>().toEqualTypeOf<upstream0.ExtractAtomValue<upstream1.WritableAtom<number, [string], boolean>>>();
expectTypeOf<
	port0.ExtractAtomArgs<upstream1.WritableAtom<number, [string], boolean>>
>().toEqualTypeOf<upstream0.ExtractAtomArgs<upstream1.WritableAtom<number, [string], boolean>>>();
expectTypeOf<
	port0.ExtractAtomResult<upstream1.WritableAtom<number, [string], boolean>>
>().toEqualTypeOf<upstream0.ExtractAtomResult<upstream1.WritableAtom<number, [string], boolean>>>();
expectTypeOf<port0.SetStateAction<number>>().toEqualTypeOf<upstream0.SetStateAction<number>>();
expectTypeOf<Parameters<typeof port0.Provider>[0]>().toEqualTypeOf<{
	children?: OctaneNode;
	store?: ReturnType<typeof upstream1.createStore>;
}>();
expectTypeOf<ReturnType<typeof port0.Provider>>().toEqualTypeOf<JSX.Element>();
expectTypeOf<typeof port0.useStore>().toEqualTypeOf<typeof upstream0.useStore>();
expectTypeOf<typeof port0.useAtomValue>().toEqualTypeOf<typeof upstream0.useAtomValue>();
expectTypeOf<typeof port0.useSetAtom>().toEqualTypeOf<typeof upstream0.useSetAtom>();
expectTypeOf<typeof port0.useAtom>().toEqualTypeOf<typeof upstream0.useAtom>();
expectTypeOf<typeof port0.useAtomValueRaw>().toEqualTypeOf<typeof upstream0.useAtomValueRaw>();
expectTypeOf<typeof port0.useAtomValueRawSync>().toEqualTypeOf<
	typeof upstream0.useAtomValueRawSync
>();
expectTypeOf<typeof port1.atom>().toEqualTypeOf<typeof upstream1.atom>();
expectTypeOf<port1.Atom<number>>().toEqualTypeOf<upstream1.Atom<number>>();
expectTypeOf<port1.WritableAtom<number, [string], boolean>>().toEqualTypeOf<
	upstream1.WritableAtom<number, [string], boolean>
>();
expectTypeOf<port1.PrimitiveAtom<number>>().toEqualTypeOf<upstream1.PrimitiveAtom<number>>();
expectTypeOf<typeof port1.createStore>().toEqualTypeOf<typeof upstream1.createStore>();
expectTypeOf<typeof port1.getDefaultStore>().toEqualTypeOf<typeof upstream1.getDefaultStore>();
expectTypeOf<typeof port1.INTERNAL_overrideCreateStore>().toEqualTypeOf<
	typeof upstream1.INTERNAL_overrideCreateStore
>();
expectTypeOf<port1.Getter>().toEqualTypeOf<upstream1.Getter>();
expectTypeOf<port1.Setter>().toEqualTypeOf<upstream1.Setter>();
expectTypeOf<
	port1.ExtractAtomValue<upstream1.WritableAtom<number, [string], boolean>>
>().toEqualTypeOf<upstream1.ExtractAtomValue<upstream1.WritableAtom<number, [string], boolean>>>();
expectTypeOf<
	port1.ExtractAtomArgs<upstream1.WritableAtom<number, [string], boolean>>
>().toEqualTypeOf<upstream1.ExtractAtomArgs<upstream1.WritableAtom<number, [string], boolean>>>();
expectTypeOf<
	port1.ExtractAtomResult<upstream1.WritableAtom<number, [string], boolean>>
>().toEqualTypeOf<upstream1.ExtractAtomResult<upstream1.WritableAtom<number, [string], boolean>>>();
expectTypeOf<port1.SetStateAction<number>>().toEqualTypeOf<upstream1.SetStateAction<number>>();
expectTypeOf<typeof port2.RESET>().toEqualTypeOf<typeof upstream2.RESET>();
expectTypeOf<typeof port2.atomWithReset>().toEqualTypeOf<typeof upstream2.atomWithReset>();
expectTypeOf<typeof port2.atomWithReducer>().toEqualTypeOf<typeof upstream2.atomWithReducer>();
expectTypeOf<typeof port2.selectAtom>().toEqualTypeOf<typeof upstream2.selectAtom>();
expectTypeOf<typeof port2.freezeAtom>().toEqualTypeOf<typeof upstream2.freezeAtom>();
expectTypeOf<typeof port2.freezeAtomCreator>().toEqualTypeOf<typeof upstream2.freezeAtomCreator>();
expectTypeOf<typeof port2.splitAtom>().toEqualTypeOf<typeof upstream2.splitAtom>();
expectTypeOf<typeof port2.atomWithDefault>().toEqualTypeOf<typeof upstream2.atomWithDefault>();
expectTypeOf<typeof port2.atomWithStorage>().toEqualTypeOf<typeof upstream2.atomWithStorage>();
expectTypeOf<typeof port2.createJSONStorage>().toEqualTypeOf<typeof upstream2.createJSONStorage>();
expectTypeOf<typeof port2.unstable_withStorageValidator>().toEqualTypeOf<
	typeof upstream2.unstable_withStorageValidator
>();
expectTypeOf<typeof port2.atomWithObservable>().toEqualTypeOf<
	typeof upstream2.atomWithObservable
>();
expectTypeOf<typeof port2.unwrap>().toEqualTypeOf<typeof upstream2.unwrap>();
expectTypeOf<typeof port2.atomWithRefresh>().toEqualTypeOf<typeof upstream2.atomWithRefresh>();
expectTypeOf<typeof port2.atomWithLazy>().toEqualTypeOf<typeof upstream2.atomWithLazy>();
expectTypeOf<port3.INTERNAL_AtomState<number>>().toEqualTypeOf<
	upstream3.INTERNAL_AtomState<number>
>();
expectTypeOf<port3.INTERNAL_Mounted>().toEqualTypeOf<upstream3.INTERNAL_Mounted>();
expectTypeOf<port3.INTERNAL_AtomStateMap>().toEqualTypeOf<upstream3.INTERNAL_AtomStateMap>();
expectTypeOf<port3.INTERNAL_MountedMap>().toEqualTypeOf<upstream3.INTERNAL_MountedMap>();
expectTypeOf<port3.INTERNAL_InvalidatedAtoms>().toEqualTypeOf<upstream3.INTERNAL_InvalidatedAtoms>();
expectTypeOf<port3.INTERNAL_ChangedAtoms>().toEqualTypeOf<upstream3.INTERNAL_ChangedAtoms>();
expectTypeOf<port3.INTERNAL_Callbacks>().toEqualTypeOf<upstream3.INTERNAL_Callbacks>();
expectTypeOf<port3.INTERNAL_AtomRead>().toEqualTypeOf<upstream3.INTERNAL_AtomRead>();
expectTypeOf<port3.INTERNAL_AtomWrite>().toEqualTypeOf<upstream3.INTERNAL_AtomWrite>();
expectTypeOf<port3.INTERNAL_AtomOnInit>().toEqualTypeOf<upstream3.INTERNAL_AtomOnInit>();
expectTypeOf<port3.INTERNAL_AtomOnMount>().toEqualTypeOf<upstream3.INTERNAL_AtomOnMount>();
expectTypeOf<port3.INTERNAL_EnsureAtomState>().toEqualTypeOf<upstream3.INTERNAL_EnsureAtomState>();
expectTypeOf<port3.INTERNAL_FlushCallbacks>().toEqualTypeOf<upstream3.INTERNAL_FlushCallbacks>();
expectTypeOf<port3.INTERNAL_RecomputeInvalidatedAtoms>().toEqualTypeOf<upstream3.INTERNAL_RecomputeInvalidatedAtoms>();
expectTypeOf<port3.INTERNAL_ReadAtomState>().toEqualTypeOf<upstream3.INTERNAL_ReadAtomState>();
expectTypeOf<port3.INTERNAL_InvalidateDependents>().toEqualTypeOf<upstream3.INTERNAL_InvalidateDependents>();
expectTypeOf<port3.INTERNAL_WriteAtomState>().toEqualTypeOf<upstream3.INTERNAL_WriteAtomState>();
expectTypeOf<port3.INTERNAL_MountDependencies>().toEqualTypeOf<upstream3.INTERNAL_MountDependencies>();
expectTypeOf<port3.INTERNAL_MountAtom>().toEqualTypeOf<upstream3.INTERNAL_MountAtom>();
expectTypeOf<port3.INTERNAL_UnmountAtom>().toEqualTypeOf<upstream3.INTERNAL_UnmountAtom>();
expectTypeOf<port3.INTERNAL_Store>().toEqualTypeOf<upstream3.INTERNAL_Store>();
expectTypeOf<port3.INTERNAL_BuildingBlocks>().toEqualTypeOf<upstream3.INTERNAL_BuildingBlocks>();
expectTypeOf<port3.INTERNAL_StoreHooks>().toEqualTypeOf<upstream3.INTERNAL_StoreHooks>();
expectTypeOf<typeof port3.INTERNAL_buildStoreRev4>().toEqualTypeOf<
	typeof upstream3.INTERNAL_buildStoreRev4
>();
expectTypeOf<typeof port3.INTERNAL_getBuildingBlocksRev4>().toEqualTypeOf<
	typeof upstream3.INTERNAL_getBuildingBlocksRev4
>();
expectTypeOf<typeof port3.INTERNAL_initializeStoreHooksRev4>().toEqualTypeOf<
	typeof upstream3.INTERNAL_initializeStoreHooksRev4
>();
expectTypeOf<typeof port3.INTERNAL_KEY_atomStateMap>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_atomStateMap
>();
expectTypeOf<typeof port3.INTERNAL_KEY_mountedMap>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_mountedMap
>();
expectTypeOf<typeof port3.INTERNAL_KEY_invalidatedAtoms>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_invalidatedAtoms
>();
expectTypeOf<typeof port3.INTERNAL_KEY_changedAtoms>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_changedAtoms
>();
expectTypeOf<typeof port3.INTERNAL_KEY_mountCallbacks>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_mountCallbacks
>();
expectTypeOf<typeof port3.INTERNAL_KEY_unmountCallbacks>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_unmountCallbacks
>();
expectTypeOf<typeof port3.INTERNAL_KEY_storeHooks>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_storeHooks
>();
expectTypeOf<typeof port3.INTERNAL_KEY_atomRead>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_atomRead
>();
expectTypeOf<typeof port3.INTERNAL_KEY_atomWrite>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_atomWrite
>();
expectTypeOf<typeof port3.INTERNAL_KEY_atomOnInit>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_atomOnInit
>();
expectTypeOf<typeof port3.INTERNAL_KEY_atomOnMount>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_atomOnMount
>();
expectTypeOf<typeof port3.INTERNAL_KEY_ensureAtomState>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_ensureAtomState
>();
expectTypeOf<typeof port3.INTERNAL_KEY_flushCallbacks>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_flushCallbacks
>();
expectTypeOf<typeof port3.INTERNAL_KEY_recomputeInvalidatedAtoms>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_recomputeInvalidatedAtoms
>();
expectTypeOf<typeof port3.INTERNAL_KEY_readAtomState>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_readAtomState
>();
expectTypeOf<typeof port3.INTERNAL_KEY_invalidateDependents>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_invalidateDependents
>();
expectTypeOf<typeof port3.INTERNAL_KEY_writeAtomState>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_writeAtomState
>();
expectTypeOf<typeof port3.INTERNAL_KEY_mountDependencies>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_mountDependencies
>();
expectTypeOf<typeof port3.INTERNAL_KEY_mountAtom>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_mountAtom
>();
expectTypeOf<typeof port3.INTERNAL_KEY_unmountAtom>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_unmountAtom
>();
expectTypeOf<typeof port3.INTERNAL_KEY_setAtomStateValueOrPromise>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_setAtomStateValueOrPromise
>();
expectTypeOf<typeof port3.INTERNAL_KEY_storeGet>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_storeGet
>();
expectTypeOf<typeof port3.INTERNAL_KEY_storeSet>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_storeSet
>();
expectTypeOf<typeof port3.INTERNAL_KEY_storeSub>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_storeSub
>();
expectTypeOf<typeof port3.INTERNAL_KEY_enhanceBuildingBlocks>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_enhanceBuildingBlocks
>();
expectTypeOf<typeof port3.INTERNAL_KEY_abortHandlersMap>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_abortHandlersMap
>();
expectTypeOf<typeof port3.INTERNAL_KEY_registerAbortHandler>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_registerAbortHandler
>();
expectTypeOf<typeof port3.INTERNAL_KEY_abortPromise>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_abortPromise
>();
expectTypeOf<typeof port3.INTERNAL_KEY_storeEpochHolder>().toEqualTypeOf<
	typeof upstream3.INTERNAL_KEY_storeEpochHolder
>();
expectTypeOf<typeof port3.INTERNAL_hasInitialValue>().toEqualTypeOf<
	typeof upstream3.INTERNAL_hasInitialValue
>();
expectTypeOf<typeof port3.INTERNAL_isActuallyWritableAtom>().toEqualTypeOf<
	typeof upstream3.INTERNAL_isActuallyWritableAtom
>();
expectTypeOf<typeof port3.INTERNAL_isAtomStateInitialized>().toEqualTypeOf<
	typeof upstream3.INTERNAL_isAtomStateInitialized
>();
expectTypeOf<typeof port3.INTERNAL_returnAtomValue>().toEqualTypeOf<
	typeof upstream3.INTERNAL_returnAtomValue
>();
expectTypeOf<typeof port3.INTERNAL_isPromiseLike>().toEqualTypeOf<
	typeof upstream3.INTERNAL_isPromiseLike
>();
expectTypeOf<typeof port3.INTERNAL_shouldThrowSynchronously>().toEqualTypeOf<
	typeof upstream3.INTERNAL_shouldThrowSynchronously
>();
expectTypeOf<typeof port3.INTERNAL_addPendingPromiseToDependency>().toEqualTypeOf<
	typeof upstream3.INTERNAL_addPendingPromiseToDependency
>();
expectTypeOf<typeof port3.INTERNAL_getMountedOrPendingDependents>().toEqualTypeOf<
	typeof upstream3.INTERNAL_getMountedOrPendingDependents
>();
expectTypeOf<Parameters<typeof port4.Provider>[0]>().toEqualTypeOf<{
	children?: OctaneNode;
	store?: ReturnType<typeof upstream1.createStore>;
}>();
expectTypeOf<ReturnType<typeof port4.Provider>>().toEqualTypeOf<JSX.Element>();
expectTypeOf<typeof port4.useStore>().toEqualTypeOf<typeof upstream4.useStore>();
expectTypeOf<typeof port4.useAtomValue>().toEqualTypeOf<typeof upstream4.useAtomValue>();
expectTypeOf<typeof port4.useSetAtom>().toEqualTypeOf<typeof upstream4.useSetAtom>();
expectTypeOf<typeof port4.useAtom>().toEqualTypeOf<typeof upstream4.useAtom>();
expectTypeOf<typeof port4.useAtomValueRaw>().toEqualTypeOf<typeof upstream4.useAtomValueRaw>();
expectTypeOf<typeof port4.useAtomValueRawSync>().toEqualTypeOf<
	typeof upstream4.useAtomValueRawSync
>();
expectTypeOf<typeof port5.useResetAtom>().toEqualTypeOf<typeof upstream5.useResetAtom>();
expectTypeOf<typeof port5.useReducerAtom>().toEqualTypeOf<typeof upstream5.useReducerAtom>();
expectTypeOf<typeof port5.useAtomCallback>().toEqualTypeOf<typeof upstream5.useAtomCallback>();
expectTypeOf(port5.useHydrateAtoms([[port0.atom(1), 2]])).toEqualTypeOf<void>();
expectTypeOf<typeof port6.RESET>().toEqualTypeOf<typeof upstream6.RESET>();
expectTypeOf<typeof port6.atomWithReset>().toEqualTypeOf<typeof upstream6.atomWithReset>();
expectTypeOf<typeof port6.atomWithReducer>().toEqualTypeOf<typeof upstream6.atomWithReducer>();
expectTypeOf<typeof port6.selectAtom>().toEqualTypeOf<typeof upstream6.selectAtom>();
expectTypeOf<typeof port6.freezeAtom>().toEqualTypeOf<typeof upstream6.freezeAtom>();
expectTypeOf<typeof port6.freezeAtomCreator>().toEqualTypeOf<typeof upstream6.freezeAtomCreator>();
expectTypeOf<typeof port6.splitAtom>().toEqualTypeOf<typeof upstream6.splitAtom>();
expectTypeOf<typeof port6.atomWithDefault>().toEqualTypeOf<typeof upstream6.atomWithDefault>();
expectTypeOf<typeof port6.atomWithStorage>().toEqualTypeOf<typeof upstream6.atomWithStorage>();
expectTypeOf<typeof port6.createJSONStorage>().toEqualTypeOf<typeof upstream6.createJSONStorage>();
expectTypeOf<typeof port6.unstable_withStorageValidator>().toEqualTypeOf<
	typeof upstream6.unstable_withStorageValidator
>();
expectTypeOf<typeof port6.atomWithObservable>().toEqualTypeOf<
	typeof upstream6.atomWithObservable
>();
expectTypeOf<typeof port6.unwrap>().toEqualTypeOf<typeof upstream6.unwrap>();
expectTypeOf<typeof port6.atomWithRefresh>().toEqualTypeOf<typeof upstream6.atomWithRefresh>();
expectTypeOf<typeof port6.atomWithLazy>().toEqualTypeOf<typeof upstream6.atomWithLazy>();
expectTypeOf<typeof port6.useResetAtom>().toEqualTypeOf<typeof upstream6.useResetAtom>();
expectTypeOf<typeof port6.useReducerAtom>().toEqualTypeOf<typeof upstream6.useReducerAtom>();
expectTypeOf<typeof port6.useAtomCallback>().toEqualTypeOf<typeof upstream6.useAtomCallback>();
expectTypeOf(port6.useHydrateAtoms([[port0.atom(1), 2]])).toEqualTypeOf<void>();

const count = port0.atom(1);
// @ts-expect-error a number atom cannot be written with a string
port0.useSetAtom(count)('wrong');
// @ts-expect-error Jotai 3 removed the delay option
port0.useAtomValue(count, { delay: 10 });
// @ts-expect-error removed upstream vanilla utility
port2.atomFamily;
// @ts-expect-error removed upstream vanilla utility
port2.loadable;
// @ts-expect-error the provider requires a Jotai store
port0.Provider({ store: 1 });

// Retained Octane utility alias: valid values preserve tuples; invalid values
// remain uninhabitable rather than widening through an opaque type.
type Counter = port1.PrimitiveAtom<number>;
expectTypeOf<port5.INTERNAL_InferAtomTuples<[[Counter, number]]>>().toEqualTypeOf<
	[readonly [Counter, number]]
>();
expectTypeOf<port6.INTERNAL_InferAtomTuples<[[Counter, number]]>>().toEqualTypeOf<
	[readonly [Counter, number]]
>();
const invalidHydration: port5.INTERNAL_InferAtomTuples<[[Counter, string]]> = [
	// @ts-expect-error string is not a valid initial value for a numeric atom
	[port1.atom(0), 'bad'],
];
void invalidHydration;
