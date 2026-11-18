import type {
	ValdiChild as Child,
	ValdiComponent as Component,
	ValdiComponentRuntimeAdapter,
	ValdiContext,
} from 'octane/compiler/valdi';
export type {
	LayoutSnapshotOptions,
	LayoutSnapshotOptionsWithInitial,
	LinkedStateOptions,
	LinkedStatePrevious,
} from 'octane/compiler/valdi';

interface Prototype {
	readonly tag: string;
}
interface Element {
	readonly nativeElement: unique symbol;
}
type Constructor = (props: unknown) => void;
type Adapter = ValdiComponentRuntimeAdapter<Prototype, Constructor, string, Element>;

export type Context<Value> = ValdiContext<Value, Element>;
export type ValdiChild = Child<Element>;
export type ValdiComponent<Props = object> = Component<Props, Element>;

export declare const assertValdiCompilerAbi: Adapter['assertValdiCompilerAbi'];
export declare const defineValdiComponent: Adapter['defineValdiComponent'];
export declare const getValdiComponentConstructor: Adapter['getValdiComponentConstructor'];
export declare const createValdiChildren: Adapter['createValdiChildren'];
export declare const valdiKey: Adapter['valdiKey'];
export declare const setValdiAttributes: Adapter['setValdiAttributes'];
export declare const hookSlots: Adapter['hookSlots'];
export declare const withSlot: Adapter['withSlot'];
export declare const useState: Adapter['useState'];
export declare const __useStateWithGetter: Adapter['__useStateWithGetter'];
export declare const useMemo: Adapter['useMemo'];
export declare const useCallback: Adapter['useCallback'];
export declare const useRef: Adapter['useRef'];
export declare const useLayoutEffect: Adapter['useLayoutEffect'];
export declare const __methodDep: Adapter['__methodDep'];
export declare const createContext: Adapter['createContext'];
export declare const useContext: Adapter['useContext'];
export declare const useSyncExternalStore: Adapter['useSyncExternalStore'];
export declare const useEffect: Adapter['useEffect'];
export declare const useEffectEvent: Adapter['useEffectEvent'];
export declare const useLinkedState: Adapter['useLinkedState'];
export declare const __useLinkedStateWithGetter: Adapter['__useLinkedStateWithGetter'];
export declare const useId: Adapter['useId'];
export declare const useLazyRef: Adapter['useLazyRef'];
export declare const useLayoutSnapshot: Adapter['useLayoutSnapshot'];
export declare const flushSync: Adapter['flushSync'];
export declare const ErrorBoundary: Adapter['ErrorBoundary'];
export declare const Suspense: Adapter['Suspense'];
export declare const lazy: Adapter['lazy'];
export declare const jsx: Required<Adapter['jsx']>;
