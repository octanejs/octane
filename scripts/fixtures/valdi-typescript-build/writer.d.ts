import type { ValdiAdapter } from 'octane/compiler/valdi';

interface Prototype {
	readonly tag: string;
}
type Constructor = (props: unknown) => void;
type Adapter = ValdiAdapter<Prototype, Constructor, string>;

export declare const assertValdiCompilerAbi: Adapter['assertValdiCompilerAbi'];
export declare const defineValdiComponent: Adapter['defineValdiComponent'];
export declare const getValdiComponentConstructor: Adapter['getValdiComponentConstructor'];
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
// The recorder implements both optional host-text capabilities.
export declare const jsx: Required<Adapter['jsx']>;
