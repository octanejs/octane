import { createElement, type OctaneNode, type Ref, type ComponentBody } from 'octane';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import * as A from '@octanejs/mobx';
import type * as Core from '../../typetests/core-contracts';
import {
	Observer,
	observer,
	useLocalObservable,
	useObserver,
	enableStaticRendering,
	useStaticRendering,
	clearTimers,
	observable,
	runInAction,
} from '@octanejs/mobx';

type IsAny<T> = 0 extends 1 & T ? true : false;

const Generic = observer(<T>(props: { value: T; onValue: (value: T) => void }) => null);
Generic({ value: 1, onValue: (value: number) => value.toFixed() });
Generic({ value: 'value', onValue: (value: string) => value.toUpperCase() });
// @ts-expect-error observer preserves the relationship between generic props
Generic({ value: 1, onValue: (value: string) => value.toUpperCase() });

const Input = observer((props: { value: string; ref?: Ref<HTMLInputElement> }) => null);
const ref: { current: HTMLInputElement | null } = { current: null };
createElement(Input, { value: 'value', ref });
// @ts-expect-error refs retain their element type
createElement(Input, { value: 'value', ref: { current: document.createElement('button') } });
// @ts-expect-error required props remain required
createElement(Input, { ref });

const render = (): OctaneNode => createElement('span', {}, 'value');
createElement(Observer, { children: render });
createElement(Observer, { render });
// @ts-expect-error children and render remain mutually exclusive
createElement(Observer, { children: render, render });

const store = useLocalObservable(() => ({
	count: 0,
	increment() {
		this.count++;
	},
}));
store.increment();
const count = useObserver(() => store.count);
export type StoreIsPrecise = Assert<IsAny<typeof store> extends false ? true : false>;
export type ResultIsPrecise = Assert<IsAny<typeof count> extends false ? true : false>;
// @ts-expect-error local observable members retain their type
store.count = 'invalid';

const coreStore = observable({ count: 1 });
const map = useLocalObservable(() => new Map<string, number>());
map.set('count', 1);
// @ts-expect-error Map values remain typed
map.set('count', 'invalid');
export type MapIsPrecise = Assert<IsAny<typeof map> extends false ? true : false>;
runInAction(() => {
	coreStore.count++;
});
enableStaticRendering(true);
useStaticRendering(false);
clearTimers();

// Complete native binding contracts, including the retained compatibility aliases.
type ObserverPropsContract = Assert<
	Equal<
		A.ObserverProps,
		| { children: () => OctaneNode; render?: never }
		| { children?: never; render: () => OctaneNode }
		| { children?: never; render?: never }
	>
>;
type ObserverComponentContract = Assert<
	Equal<
		A.ObserverComponent<{ value: number }>,
		ComponentBody<{ value: number }> & { displayName?: string }
	>
>;
type ObserverContract = Assert<
	Equal<
		typeof A.Observer,
		ComponentBody<
			| { children: () => OctaneNode; render?: never }
			| { children?: never; render: () => OctaneNode }
			| { children?: never; render?: never }
		> & { displayName: string }
	>
>;
// @ts-expect-error Observer's public display name remains a string
A.Observer.displayName = 1;

const observed = A.observer((props: { value: number }) => null);
type ObservedProps = Assert<Equal<Parameters<typeof observed>[0], { value: number }>>;
type LocalObservableContract = Assert<
	Equal<ReturnType<typeof A.useLocalObservable<{ value: number }>>, { value: number }>
>;
type ObserverHookContract = Assert<Equal<ReturnType<typeof A.useObserver<number>>, number>>;
type StaticContract = Assert<Equal<typeof A.enableStaticRendering, (enable: boolean) => void>>;
type StaticAliasContract = Assert<Equal<typeof A.useStaticRendering, (enable: boolean) => void>>;
type StaticReadContract = Assert<Equal<typeof A.isUsingStaticRendering, () => boolean>>;
type ClearContract = Assert<Equal<typeof A.clearTimers, () => void>>;
type RegistryContract = Assert<
	Equal<
		Parameters<typeof A._observerFinalizationRegistry.register>,
		[target: object, value: { reaction: import('mobx').Reaction | null }, token?: object]
	>
>;
A.Reaction satisfies Core.Value_Reaction;
A.untracked satisfies Core.Value_untracked;
A.createAtom satisfies Core.Value_createAtom;
A.spy satisfies Core.Value_spy;
A.compareDefault satisfies Core.Value_compareDefault;
A.compareIdentity satisfies Core.Value_compareIdentity;
A.compareStructural satisfies Core.Value_compareStructural;
A.compareShallow satisfies Core.Value_compareShallow;
A.isObservableObject satisfies Core.Value_isObservableObject;
A.isBoxedObservable satisfies Core.Value_isBoxedObservable;
A.isObservableArray satisfies Core.Value_isObservableArray;
A.ObservableMap satisfies Core.Value_ObservableMap;
A.isObservableMap satisfies Core.Value_isObservableMap;
A.ObservableSet satisfies Core.Value_ObservableSet;
A.isObservableSet satisfies Core.Value_isObservableSet;
A.transaction satisfies Core.Value_transaction;
A.observable satisfies Core.Value_observable;
A.observableRef satisfies Core.Value_observableRef;
A.observableShallow satisfies Core.Value_observableShallow;
A.observableDeep satisfies Core.Value_observableDeep;
A.observableStruct satisfies Core.Value_observableStruct;
A.computed satisfies Core.Value_computed;
A.computedStruct satisfies Core.Value_computedStruct;
A.isObservable satisfies Core.Value_isObservable;
A.isObservableProp satisfies Core.Value_isObservableProp;
A.isComputed satisfies Core.Value_isComputed;
A.isComputedProp satisfies Core.Value_isComputedProp;
A.extendObservable satisfies Core.Value_extendObservable;
A.observe satisfies Core.Value_observe;
A.intercept satisfies Core.Value_intercept;
A.autorun satisfies Core.Value_autorun;
A.reaction satisfies Core.Value_reaction;
A.when satisfies Core.Value_when;
A.action satisfies Core.Value_action;
A.actionBound satisfies Core.Value_actionBound;
A.isAction satisfies Core.Value_isAction;
A.runInAction satisfies Core.Value_runInAction;
A.keys satisfies Core.Value_keys;
A.values satisfies Core.Value_values;
A.entries satisfies Core.Value_entries;
A.set satisfies Core.Value_set;
A.remove satisfies Core.Value_remove;
A.has satisfies Core.Value_has;
A.get satisfies Core.Value_get;
A.ownKeys satisfies Core.Value_ownKeys;
A.defineProperty satisfies Core.Value_defineProperty;
A.configure satisfies Core.Value_configure;
A.onBecomeObserved satisfies Core.Value_onBecomeObserved;
A.onBecomeUnobserved satisfies Core.Value_onBecomeUnobserved;
A.flow satisfies Core.Value_flow;
A.flowBound satisfies Core.Value_flowBound;
A.isFlow satisfies Core.Value_isFlow;
A.flowResult satisfies Core.Value_flowResult;
A.FlowCancellationError satisfies Core.Value_FlowCancellationError;
A.isFlowCancellationError satisfies Core.Value_isFlowCancellationError;
A.toJS satisfies Core.Value_toJS;
A.getDependencyTree satisfies Core.Value_getDependencyTree;
A.getObserverTree satisfies Core.Value_getObserverTree;
A._resetGlobalState satisfies Core.Value__resetGlobalState;
A._getGlobalState satisfies Core.Value__getGlobalState;
A.getDebugName satisfies Core.Value_getDebugName;
A.getAtom satisfies Core.Value_getAtom;
A._getAdministration satisfies Core.Value__getAdministration;
A._allowStateChanges satisfies Core.Value__allowStateChanges;
A._allowStateChangesInsideComputed satisfies Core.Value__allowStateChangesInsideComputed;
A.$mobx satisfies Core.Value_$mobx;
A._isComputingDerivation satisfies Core.Value__isComputingDerivation;
A.onReactionError satisfies Core.Value_onReactionError;
A._interceptReads satisfies Core.Value__interceptReads;
A._startAction satisfies Core.Value__startAction;
A._endAction satisfies Core.Value__endAction;
A._allowStateReadsStart satisfies Core.Value__allowStateReadsStart;
A._allowStateReadsEnd satisfies Core.Value__allowStateReadsEnd;
A.makeObservable satisfies Core.Value_makeObservable;
A.makeAutoObservable satisfies Core.Value_makeAutoObservable;
A._autoAction satisfies Core.Value__autoAction;
A._autoActionBound satisfies Core.Value__autoActionBound;
A.override satisfies Core.Value_override;
type CoreIObservable = Assert<Equal<A.IObservable, Core.Type_IObservable>>;
type CoreIDepTreeNode = Assert<Equal<A.IDepTreeNode, Core.Type_IDepTreeNode>>;
type CoreIReactionPublic = Assert<Equal<A.IReactionPublic, Core.Type_IReactionPublic>>;
type CoreIReactionDisposer = Assert<Equal<A.IReactionDisposer, Core.Type_IReactionDisposer>>;
type CoreIAtom = Assert<Equal<A.IAtom, Core.Type_IAtom>>;
type CoreIComputedValue = Assert<Equal<A.IComputedValue<number>, Core.Type_IComputedValue>>;
type CoreIEqualsComparer = Assert<Equal<A.IEqualsComparer<number>, Core.Type_IEqualsComparer>>;
type CoreIEnhancer = Assert<Equal<A.IEnhancer<number>, Core.Type_IEnhancer>>;
type CoreIInterceptable = Assert<Equal<A.IInterceptable<number>, Core.Type_IInterceptable>>;
type CoreIInterceptor = Assert<Equal<A.IInterceptor<number>, Core.Type_IInterceptor>>;
type CoreIListenable = Assert<Equal<A.IListenable, Core.Type_IListenable>>;
type CoreIObjectWillChange = Assert<
	Equal<A.IObjectWillChange<number>, Core.Type_IObjectWillChange>
>;
type CoreIObjectDidChange = Assert<Equal<A.IObjectDidChange<number>, Core.Type_IObjectDidChange>>;
type CoreIValueDidChange = Assert<Equal<A.IValueDidChange<number>, Core.Type_IValueDidChange>>;
type CoreIValueWillChange = Assert<Equal<A.IValueWillChange<number>, Core.Type_IValueWillChange>>;
type CoreIObservableValue = Assert<Equal<A.IObservableValue<number>, Core.Type_IObservableValue>>;
type CoreIObservableArray = Assert<Equal<A.IObservableArray<number>, Core.Type_IObservableArray>>;
type CoreIArrayWillChange = Assert<Equal<A.IArrayWillChange<number>, Core.Type_IArrayWillChange>>;
type CoreIArrayWillSplice = Assert<Equal<A.IArrayWillSplice<number>, Core.Type_IArrayWillSplice>>;
type CoreIArraySplice = Assert<Equal<A.IArraySplice<number>, Core.Type_IArraySplice>>;
type CoreIArrayUpdate = Assert<Equal<A.IArrayUpdate<number>, Core.Type_IArrayUpdate>>;
type CoreIArrayDidChange = Assert<Equal<A.IArrayDidChange<number>, Core.Type_IArrayDidChange>>;
type CoreIKeyValueMap = Assert<Equal<A.IKeyValueMap<number>, Core.Type_IKeyValueMap>>;
type CoreIMapEntries = Assert<Equal<A.IMapEntries<number, number>, Core.Type_IMapEntries>>;
type CoreIMapEntry = Assert<Equal<A.IMapEntry<number, number>, Core.Type_IMapEntry>>;
type CoreIMapWillChange = Assert<Equal<A.IMapWillChange<number, number>, Core.Type_IMapWillChange>>;
type CoreIMapDidChange = Assert<Equal<A.IMapDidChange<number, number>, Core.Type_IMapDidChange>>;
type CoreIObservableMapInitialValues = Assert<
	Equal<A.IObservableMapInitialValues<number, number>, Core.Type_IObservableMapInitialValues>
>;
type CoreISetDidChange = Assert<Equal<A.ISetDidChange<number>, Core.Type_ISetDidChange>>;
type CoreISetWillChange = Assert<Equal<A.ISetWillChange<number>, Core.Type_ISetWillChange>>;
type CoreIObservableSetInitialValues = Assert<
	Equal<A.IObservableSetInitialValues<number>, Core.Type_IObservableSetInitialValues>
>;
type CoreIObservableFactory = Assert<Equal<A.IObservableFactory, Core.Type_IObservableFactory>>;
type CoreCreateObservableOptions = Assert<
	Equal<A.CreateObservableOptions, Core.Type_CreateObservableOptions>
>;
type CoreIComputedFactory = Assert<Equal<A.IComputedFactory, Core.Type_IComputedFactory>>;
type CoreIAutorunOptions = Assert<Equal<A.IAutorunOptions, Core.Type_IAutorunOptions>>;
type CoreIReactionOptions = Assert<
	Equal<A.IReactionOptions<number, boolean>, Core.Type_IReactionOptions>
>;
type CoreIWhenOptions = Assert<Equal<A.IWhenOptions, Core.Type_IWhenOptions>>;
type CoreIActionFactory = Assert<Equal<A.IActionFactory, Core.Type_IActionFactory>>;
type CoreCancellablePromise = Assert<
	Equal<A.CancellablePromise<number>, Core.Type_CancellablePromise>
>;
type CoreIObserverTree = Assert<Equal<A.IObserverTree, Core.Type_IObserverTree>>;
type CoreIDependencyTree = Assert<Equal<A.IDependencyTree, Core.Type_IDependencyTree>>;
type CoreLambda = Assert<Equal<A.Lambda, Core.Type_Lambda>>;
type CoreIComputedValueOptions = Assert<
	Equal<A.IComputedValueOptions<number>, Core.Type_IComputedValueOptions>
>;
type CoreIActionRunInfo = Assert<Equal<A.IActionRunInfo, Core.Type_IActionRunInfo>>;
type CoreAnnotationsMap = Assert<Equal<A.AnnotationsMap<number, string>, Core.Type_AnnotationsMap>>;
type CoreAnnotationMapEntry = Assert<Equal<A.AnnotationMapEntry, Core.Type_AnnotationMapEntry>>;

type RegistryTokenContract = Assert<
	Equal<Parameters<typeof A._observerFinalizationRegistry.unregister>, [token: object]>
>;

A.observer satisfies <P>(
	component: ComponentBody<P>,
) => ComponentBody<P> & { displayName?: string };
