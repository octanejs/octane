import {
	ContextConsumer,
	ContextProvider,
	Element,
	ForwardRef,
	Fragment,
	Lazy,
	Memo,
	Portal,
	Profiler,
	StrictMode,
	Suspense,
	SuspenseList,
	isValidElementType,
	isContextConsumer,
	isContextProvider,
	isForwardRef,
	isFragment,
	isLazy,
	isMemo,
	isPortal,
	isProfiler,
	isStrictMode,
	isSuspense,
	isSuspenseList,
	typeOf,
	isElement,
} from '@octanejs/octane-is';
import type { ElementDescriptor } from 'octane';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions.js';

type ContextConsumerShape = Assert<Equal<typeof ContextConsumer, symbol>>;
type ContextProviderShape = Assert<Equal<typeof ContextProvider, symbol>>;
type ElementShape = Assert<Equal<typeof Element, symbol>>;
type ForwardRefShape = Assert<Equal<typeof ForwardRef, symbol>>;
type FragmentShape = Assert<Equal<typeof Fragment, symbol>>;
type LazyShape = Assert<Equal<typeof Lazy, symbol>>;
type MemoShape = Assert<Equal<typeof Memo, symbol>>;
type PortalShape = Assert<Equal<typeof Portal, symbol>>;
type ProfilerShape = Assert<Equal<typeof Profiler, symbol>>;
type StrictModeShape = Assert<Equal<typeof StrictMode, symbol>>;
type SuspenseShape = Assert<Equal<typeof Suspense, symbol>>;
type SuspenseListShape = Assert<Equal<typeof SuspenseList, symbol>>;
type isValidElementTypeShape = Assert<
	Equal<typeof isValidElementType, (value: unknown) => boolean>
>;
type isContextConsumerShape = Assert<Equal<typeof isContextConsumer, (value: unknown) => boolean>>;
type isContextProviderShape = Assert<Equal<typeof isContextProvider, (value: unknown) => boolean>>;
type isForwardRefShape = Assert<Equal<typeof isForwardRef, (value: unknown) => boolean>>;
type isFragmentShape = Assert<Equal<typeof isFragment, (value: unknown) => boolean>>;
type isLazyShape = Assert<Equal<typeof isLazy, (value: unknown) => boolean>>;
type isMemoShape = Assert<Equal<typeof isMemo, (value: unknown) => boolean>>;
type isPortalShape = Assert<Equal<typeof isPortal, (value: unknown) => boolean>>;
type isProfilerShape = Assert<Equal<typeof isProfiler, (value: unknown) => boolean>>;
type isStrictModeShape = Assert<Equal<typeof isStrictMode, (value: unknown) => boolean>>;
type isSuspenseShape = Assert<Equal<typeof isSuspense, (value: unknown) => boolean>>;
type isSuspenseListShape = Assert<Equal<typeof isSuspenseList, (value: unknown) => boolean>>;
type TypeOfShape = Assert<Equal<typeof typeOf, (value: unknown) => symbol | undefined>>;
type IsElementShape = Assert<
	Equal<typeof isElement, (value: unknown) => value is ElementDescriptor<unknown>>
>;

const value: unknown = null;
if (isElement(value)) {
	const kind: symbol = value.$$kind;
	void kind;
}
// @ts-expect-error The type classifier result is not a string.
const wrongKind: string = typeOf(null);
// @ts-expect-error Every predicate requires a value.
isMemo();
// @ts-expect-error Symbol exports are labels, not component factories.
Profiler();
void wrongKind;
