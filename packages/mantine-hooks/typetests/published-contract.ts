// @parity-case types:mantine-hooks-pristine:public-contract
/** @jsxImportSource octane */
// Consumer assertions derived from the pinned npm declarations.
// Every published export participates in a consumer assertion against the pinned npm types.
// Property presence and callable arity complement the recursive opacity audit,
// the complete upstream type suite, and the handwritten inference/negative examples.
import type { Assert, Equal } from '../../../scripts/react-port/type-assertions';
import type * as Native0 from '@mantine/hooks';

type SharedKeys0 = 'copied' | 'copy';
type SharedKeys1 =
	| 'anchor'
	| 'big'
	| 'blink'
	| 'bold'
	| 'charAt'
	| 'charCodeAt'
	| 'codePointAt'
	| 'endsWith'
	| 'fixed'
	| 'fontcolor'
	| 'fontsize'
	| 'isWellFormed'
	| 'italics'
	| 'link'
	| 'localeCompare'
	| 'match'
	| 'matchAll'
	| 'normalize'
	| 'padEnd'
	| 'padStart'
	| 'repeat'
	| 'replace'
	| 'replaceAll'
	| 'search'
	| 'small'
	| 'split'
	| 'startsWith'
	| 'strike'
	| 'sub'
	| 'substr'
	| 'substring'
	| 'sup'
	| 'toLocaleLowerCase'
	| 'toLocaleUpperCase'
	| 'toLowerCase'
	| 'toUpperCase'
	| 'toWellFormed'
	| 'trim'
	| 'trimEnd'
	| 'trimLeft'
	| 'trimRight'
	| 'trimStart';
type SharedKeys2 =
	| 'at'
	| 'concat'
	| 'includes'
	| 'indexOf'
	| 'lastIndexOf'
	| 'length'
	| 'slice'
	| number
	| typeof Symbol.iterator;
type SharedKeys3 = 'max' | 'min';
type SharedKeys4 = 'decrement' | 'increment';
type SharedKeys5 =
	| '0'
	| '1'
	| 'entries'
	| 'every'
	| 'find'
	| 'findIndex'
	| 'findLast'
	| 'findLastIndex'
	| 'flat'
	| 'flatMap'
	| 'forEach'
	| 'join'
	| 'keys'
	| 'map'
	| 'reduce'
	| 'reduceRight'
	| 'some'
	| 'toLocaleString'
	| 'toReversed'
	| 'toSorted'
	| 'toSpliced'
	| 'values'
	| 'with'
	| typeof Symbol.unscopables;
type SharedKeys6 = 'copyWithin' | 'fill' | 'push' | 'reverse' | 'sort' | 'splice' | 'unshift';
type SharedKeys7 = 'pop' | 'shift';
type SharedKeys8 = 'delay' | 'flushOnUnmount' | 'maxWait';
type SharedKeys9 = 'onClose' | 'onOpen';
type SharedKeys10 =
	| 'body'
	| 'cache'
	| 'credentials'
	| 'headers'
	| 'integrity'
	| 'keepalive'
	| 'method'
	| 'mode'
	| 'priority'
	| 'redirect'
	| 'referrer'
	| 'referrerPolicy'
	| 'window';
type SharedKeys11 = 'abort' | 'loading' | 'refetch';
type SharedKeys12 =
	'accept' | 'capture' | 'directory' | 'initialFiles' | 'multiple' | 'resetOnOpen';
type SharedKeys13 = 'opened' | 'shouldReturnFocus';
type SharedKeys14 = 'onBlur' | 'onFocus';
type SharedKeys15 = 'fixedAt' | 'onFix' | 'onPin' | 'onRelease' | 'scrollDistance';
type SharedKeys16 = 'preventDefault' | 'usePhysicalKeys';
type SharedKeys17 =
	| 'append'
	| 'apply'
	| 'applyWhere'
	| 'insert'
	| 'prepend'
	| 'remove'
	| 'reorder'
	| 'setItem'
	| 'setItemProp'
	| 'setState'
	| 'swap';
type SharedKeys18 = 'deserialize' | 'key' | 'serialize' | 'sync';
type SharedKeys19 = 'x' | 'y';
type SharedKeys20 = 'onScrubEnd' | 'onScrubStart';
type SharedKeys21 = 'downlink' | 'downlinkMax' | 'effectiveType' | 'online' | 'rtt' | 'saveData';
type SharedKeys22 = 'defaultAngle' | 'defaultType';
type SharedKeys23 = 'boundaries' | 'initialPage' | 'page' | 'siblings' | 'startValue';
type SharedKeys24 = 'first' | 'last';
type SharedKeys25 = 'next' | 'previous' | 'range' | 'setPage';
type SharedKeys26 = 'initialValues' | 'limit';
type SharedKeys27 = 'add' | 'cleanQueue' | 'queue' | 'update';
type SharedKeys28 =
	'cancelable' | 'duration' | 'easing' | 'isList' | 'onScrollCancel' | 'onScrollFinish';
type SharedKeys29 = 'scrollIntoView' | 'scrollableRef' | 'scrolling' | 'targetRef';
type SharedKeys30 = 'getDepth' | 'getValue' | 'scrollHost' | 'selector';
type SharedKeys31 = 'depth' | 'getNode' | 'id';
type SharedKeys32 = 'initialized' | 'reinitialize';
type SharedKeys33 = 'draggable' | 'onScrollStateChange' | 'scrollAmount';
type SharedKeys34 = 'canScrollEnd' | 'canScrollStart';
type SharedKeys35 = 'dragHandlers' | 'scrollEnd' | 'scrollStart';
type SharedKeys36 = 'back' | 'forward';
type SharedKeys37 = 'current' | 'history';
type SharedKeys38 = 'lastValidValue' | 'valid';
type SharedKeys39 = 'cancelOnMove' | 'onFinish' | 'onStart';
type SharedKeys40 =
	| 'onMouseDown'
	| 'onMouseLeave'
	| 'onMouseMove'
	| 'onMouseUp'
	| 'onTouchCancel'
	| 'onTouchEnd'
	| 'onTouchMove'
	| 'onTouchStart';
type SharedKeys41 =
	| 'constrainOffset'
	| 'constrainToViewport'
	| 'dragHandleSelector'
	| 'excludeDragHandleSelector'
	| 'initialPosition'
	| 'onDragEnd'
	| 'onDragStart'
	| 'onPositionChange';
type SharedKeys42 =
	'deselect' | 'isAllSelected' | 'isSomeSelected' | 'resetSelection' | 'select' | 'setSelection';
type SharedKeys43 = 'defaultSelection' | 'resetSelectionOnDataChange';
type SharedKeys44 = 'height' | 'width';
type SharedKeys45 = 'bottom' | 'left' | 'right' | 'top';
type SharedKeys46 =
	| 'expanded'
	| 'keepMounted'
	| 'onTransitionEnd'
	| 'onTransitionStart'
	| 'transitionDuration'
	| 'transitionTimingFunction';
type SharedKeys47 =
	| 'alwaysShowMask'
	| 'autoClear'
	| 'beforeMaskedStateChange'
	| 'invalid'
	| 'mask'
	| 'modify'
	| 'onChangeRaw'
	| 'onComplete'
	| 'separate'
	| 'showMaskOnFocus'
	| 'slotChar'
	| 'tokens'
	| 'transform';
type SharedKeys48 = 'isComplete' | 'rawValue';
type SharedKeys49 =
	'activateOnFocus' | 'columns' | 'initialIndex' | 'isItemDisabled' | 'loop' | 'onFocusChange';
type SharedKeys50 = 'dir' | 'orientation';
type SharedKeys51 = 'index' | 'onClick' | 'onKeyDown';
type SharedKeys52 = 'getItemProps' | 'setFocusedIndex';
type SharedKeys53 =
	| 'canceled'
	| 'direction'
	| 'distance'
	| 'elapsedTime'
	| 'event'
	| 'initial'
	| 'movement'
	| 'tap'
	| 'velocity'
	| 'xy';
type SharedKeys54 = 'axisThreshold' | 'filterTaps' | 'tapThreshold';
type SharedKeys55 = 'collapseThreshold' | 'collapsible' | 'defaultSize';
type SharedKeys56 =
	| 'onCollapseChange'
	| 'onResizeEnd'
	| 'onResizeStart'
	| 'onSizeChange'
	| 'redistribute'
	| 'resetOnDoubleClick'
	| 'shiftStep';
type SharedKeys57 =
	| 'activeHandle'
	| 'collapse'
	| 'collapsed'
	| 'expand'
	| 'getHandleProps'
	| 'pixelMode'
	| 'setSizes'
	| 'toggleCollapse';
type PublishedKeys0 = 'getInitialValueInEffect';
type PublishedKeys1 = 'timeout';
type PublishedKeys2 = SharedKeys0 | 'error' | 'reset';
type PublishedKeys3 = SharedKeys1 | SharedKeys2 | 'toString' | 'valueOf';
type PublishedKeys4 = SharedKeys3 | 'step';
type PublishedKeys5 = 'reset' | SharedKeys4 | 'set';
type PublishedKeys6 = SharedKeys2 | 'toString' | SharedKeys5 | SharedKeys6 | 'filter' | SharedKeys7;
type PublishedKeys7 = SharedKeys8 | 'leading';
type PublishedKeys8 = 'leading';
type PublishedKeys9 = 'cancel' | 'flush';
type PublishedKeys10 =
	SharedKeys2 | 'toString' | SharedKeys5 | SharedKeys6 | 'filter' | SharedKeys7 | '2';
type PublishedKeys11 = SharedKeys9;
type PublishedKeys12 = 'set' | 'close' | 'open' | 'toggle';
type PublishedKeys13 = 'signal';
type PublishedKeys14 = 'sRGBHex';
type PublishedKeys15 = 'open' | 'supported';
type PublishedKeys16 = 'signal' | 'autoInvoke' | SharedKeys10;
type PublishedKeys17 = 'error' | SharedKeys11 | 'data';
type PublishedKeys18 = SharedKeys12 | 'onCancel' | 'onChange';
type PublishedKeys19 = 'reset' | 'open' | 'files';
type PublishedKeys20 = SharedKeys13;
type PublishedKeys21 = SharedKeys14;
type PublishedKeys22 = 'focused' | 'ref';
type PublishedKeys23 = 'toggle' | 'ref' | 'fullscreen';
type PublishedKeys24 = SharedKeys15;
type PublishedKeys25 = SharedKeys16;
type PublishedKeys26 = 'ref' | 'hovered';
type PublishedKeys27 = 'events' | 'initialState';
type PublishedKeys28 = 'ref' | 'inViewport';
type PublishedKeys29 = 'ref' | 'entry';
type PublishedKeys30 = 'autoInvoke';
type PublishedKeys31 = 'toggle' | 'active' | 'start' | 'stop';
type PublishedKeys32 = 'filter' | SharedKeys7 | SharedKeys17;
type PublishedKeys33 = 'getInitialValueInEffect' | 'defaultValue' | SharedKeys18;
type PublishedKeys34 = SharedKeys19;
type PublishedKeys35 = SharedKeys20;
type PublishedKeys36 = 'ref' | 'active';
type PublishedKeys37 = SharedKeys21 | 'type';
type PublishedKeys38 = 'getInitialValueInEffect' | SharedKeys22;
type PublishedKeys39 = 'type' | 'angle';
type PublishedKeys40 = 'getValueInEffect';
type PublishedKeys41 = 'onChange' | SharedKeys23 | 'total';
type PublishedKeys42 = 'active' | SharedKeys24 | SharedKeys25;
type PublishedKeys43 = SharedKeys26;
type PublishedKeys44 = SharedKeys27 | 'state';
type PublishedKeys45 = 'step' | SharedKeys20 | 'onChangeEnd';
type PublishedKeys46 = 'axis' | SharedKeys28 | 'offset';
type PublishedKeys47 = 'cancel' | SharedKeys29;
type PublishedKeys48 = 'offset' | SharedKeys30;
type PublishedKeys49 = SharedKeys31 | 'value';
type PublishedKeys50 = 'data' | 'active' | SharedKeys32;
type PublishedKeys51 = SharedKeys33;
type PublishedKeys52 = 'ref' | SharedKeys34 | SharedKeys35 | 'isDragging';
type PublishedKeys53 = SharedKeys34;
type PublishedKeys54 = 'reset' | 'set' | SharedKeys36;
type PublishedKeys55 = SharedKeys37;
type PublishedKeys56 = 'start' | 'clear';
type PublishedKeys57 = 'onChange' | 'defaultValue' | 'value' | 'finalValue';
type PublishedKeys58 = 'value' | SharedKeys38;
type PublishedKeys59 = 'onCancel' | 'events' | SharedKeys39 | 'threshold';
type PublishedKeys60 = SharedKeys40;
type PublishedKeys61 = 'axis' | SharedKeys41 | 'enabled';
type PublishedKeys62 = 'ref' | 'isDragging' | 'setPosition';
type PublishedKeys63 = 'toggle' | SharedKeys42;
type PublishedKeys64 = 'data' | SharedKeys43;
type PublishedKeys65 = SharedKeys2 | 'toString' | SharedKeys5 | 'filter';
type PublishedKeys66 = 'ref' | SharedKeys44;
type PublishedKeys67 = SharedKeys19 | SharedKeys44 | SharedKeys45;
type PublishedKeys68 = SharedKeys46;
type PublishedKeys69 = 'state' | 'getCollapseProps';
type PublishedKeys70 = SharedKeys47;
type PublishedKeys71 = 'reset' | 'ref' | 'value' | SharedKeys48;
type PublishedKeys72 = 'value' | 'selection';
type PublishedKeys73 = 'total' | SharedKeys49 | SharedKeys50 | 'focusedIndex';
type PublishedKeys74 = SharedKeys51;
type PublishedKeys75 = 'focusedIndex' | SharedKeys52;
type PublishedKeys76 = 'cancel' | 'active' | SharedKeys24 | SharedKeys53 | 'delta';
type PublishedKeys77 = 'axis' | 'threshold' | 'enabled' | SharedKeys54;
type PublishedKeys78 = SharedKeys3 | SharedKeys55;
type PublishedKeys79 = 'step' | 'enabled' | SharedKeys50 | SharedKeys56 | 'panels' | 'sizes';
type PublishedKeys80 = 'reset' | 'ref' | 'sizes' | SharedKeys57;
type PublishedKeys81 = 'delta' | 'panels' | 'sizes' | 'handleIndex';
type PublishedKeys82 = 'toString' | 'valueOf';

type Contract0 = Assert<Equal<Parameters<typeof Native0.useDebouncedCallback>['length'], 2>>;
type Contract1 = Assert<Equal<Parameters<typeof Native0.useClickOutside>['length'], 1 | 2 | 3 | 4>>;
type Contract2 = Assert<Equal<Parameters<typeof Native0.useClipboard>['length'], 0 | 1>>;
type Contract3 = Assert<Equal<Parameters<typeof Native0.useColorScheme>['length'], 0 | 1 | 2>>;
type Contract4 = Assert<Equal<Parameters<typeof Native0.useCounter>['length'], 0 | 1 | 2>>;
type Contract5 = Assert<Equal<Parameters<typeof Native0.useDebouncedState>['length'], 2 | 3>>;
type Contract6 = Assert<Equal<Parameters<typeof Native0.useDebouncedValue>['length'], 2 | 3>>;
type Contract7 = Assert<Equal<Parameters<typeof Native0.useDocumentTitle>['length'], 1>>;
type Contract8 = Assert<Equal<Parameters<typeof Native0.useDocumentVisibility>['length'], 0>>;
type Contract9 = Assert<Equal<Parameters<typeof Native0.useFocusReturn>['length'], 1>>;
type Contract10 = Assert<Equal<Parameters<typeof Native0.useDidUpdate>['length'], 1 | 2>>;
type Contract11 = Assert<Equal<Parameters<typeof Native0.useFocusTrap>['length'], 0 | 1>>;
type Contract12 = Assert<Equal<Parameters<typeof Native0.useForceUpdate>['length'], 0>>;
type Contract13 = Assert<Equal<Parameters<typeof Native0.useId>['length'], 0 | 1>>;
type Contract14 = Assert<Equal<Parameters<typeof Native0.useIdle>['length'], 1 | 2>>;
type Contract15 = Assert<Equal<Parameters<typeof Native0.useInterval>['length'], 2 | 3>>;
type Contract16 = Assert<Equal<Parameters<typeof Native0.useIsomorphicEffect>['length'], 1 | 2>>;
type Contract17 = Assert<Equal<Parameters<typeof Native0.useListState>['length'], 0 | 1>>;
type Contract18 = Assert<Equal<Parameters<typeof Native0.useLocalStorage>['length'], 1>>;
type Contract19 = Assert<Equal<Parameters<typeof Native0.readLocalStorageValue>['length'], 1>>;
type Contract20 = Assert<Equal<Parameters<typeof Native0.useSessionStorage>['length'], 1>>;
type Contract21 = Assert<Equal<Parameters<typeof Native0.readSessionStorageValue>['length'], 1>>;
type Contract22 = Assert<Equal<Parameters<typeof Native0.useMediaQuery>['length'], 1 | 2 | 3>>;
type Contract23 = Assert<Equal<Parameters<typeof Native0.useMergedRef>['length'], number>>;
type Contract24 = Assert<Equal<Parameters<typeof Native0.mergeRefs>['length'], number>>;
type Contract25 = Assert<Equal<Parameters<typeof Native0.assignRef>['length'], 2>>;
type Contract26 = Assert<Equal<Parameters<typeof Native0.useMouse>['length'], 0 | 1>>;
type Contract27 = Assert<Equal<Parameters<typeof Native0.useMousePosition>['length'], 0>>;
type Contract28 = Assert<Equal<Parameters<typeof Native0.useMove>['length'], 1 | 2 | 3>>;
type Contract29 = Assert<Equal<Parameters<typeof Native0.clampUseMovePosition>['length'], 1>>;
type Contract30 = Assert<Equal<Parameters<typeof Native0.usePagination>['length'], 1>>;
type Contract31 = Assert<Equal<Parameters<typeof Native0.useQueue>['length'], 1>>;
type Contract32 = Assert<Equal<Parameters<typeof Native0.usePageLeave>['length'], 1>>;
type Contract33 = Assert<Equal<Parameters<typeof Native0.useReducedMotion>['length'], 0 | 1 | 2>>;
type Contract34 = Assert<Equal<Parameters<typeof Native0.useScrollIntoView>['length'], 0 | 1>>;
type Contract35 = Assert<Equal<Parameters<typeof Native0.useResizeObserver>['length'], 0 | 1>>;
type Contract36 = Assert<Equal<Parameters<typeof Native0.useElementSize>['length'], 0 | 1>>;
type Contract37 = Assert<Equal<Parameters<typeof Native0.useShallowEffect>['length'], 1 | 2>>;
type Contract38 = Assert<Equal<Parameters<typeof Native0.useToggle>['length'], 0 | 1>>;
type Contract39 = Assert<Equal<Parameters<typeof Native0.useUncontrolled>['length'], 1>>;
type Contract40 = Assert<Equal<Parameters<typeof Native0.useViewportSize>['length'], 0>>;
type Contract41 = Assert<Equal<Parameters<typeof Native0.useWindowEvent>['length'], 2 | 3>>;
type Contract42 = Assert<Equal<Parameters<typeof Native0.useWindowScroll>['length'], 0>>;
type Contract43 = Assert<Equal<Parameters<typeof Native0.useIntersection>['length'], 0 | 1>>;
type Contract44 = Assert<Equal<Parameters<typeof Native0.useHash>['length'], 0 | 1>>;
type Contract45 = Assert<Equal<Parameters<typeof Native0.useHotkeys>['length'], 1 | 2 | 3>>;
type Contract46 = Assert<Equal<Parameters<typeof Native0.getHotkeyHandler>['length'], 1>>;
type Contract47 = Assert<Equal<Parameters<typeof Native0.useFullscreenDocument>['length'], 0>>;
type Contract48 = Assert<Equal<Parameters<typeof Native0.useFullscreenElement>['length'], 0>>;
type Contract49 = Assert<Equal<Parameters<typeof Native0.useLogger>['length'], 2>>;
type Contract50 = Assert<Equal<Parameters<typeof Native0.useHover>['length'], 0>>;
type Contract51 = Assert<Equal<Parameters<typeof Native0.useValidatedState>['length'], 2 | 3>>;
type Contract52 = Assert<Equal<Parameters<typeof Native0.useOs>['length'], 0 | 1>>;
type Contract53 = Assert<Equal<Parameters<typeof Native0.useSetState>['length'], 1>>;
type Contract54 = Assert<Equal<Parameters<typeof Native0.useInputState>['length'], 1>>;
type Contract55 = Assert<Equal<Parameters<typeof Native0.useEventListener>['length'], 2 | 3>>;
type Contract56 = Assert<Equal<Parameters<typeof Native0.useDisclosure>['length'], 0 | 1 | 2>>;
type Contract57 = Assert<Equal<Parameters<typeof Native0.useFocusWithin>['length'], 0 | 1>>;
type Contract58 = Assert<Equal<Parameters<typeof Native0.useNetwork>['length'], 0>>;
type Contract59 = Assert<Equal<Parameters<typeof Native0.useTimeout>['length'], 2 | 3>>;
type Contract60 = Assert<Equal<Parameters<typeof Native0.useTextSelection>['length'], 0>>;
type Contract61 = Assert<Equal<Parameters<typeof Native0.usePrevious>['length'], 1>>;
type Contract62 = Assert<Equal<Parameters<typeof Native0.useFavicon>['length'], 1>>;
type Contract63 = Assert<Equal<Parameters<typeof Native0.useHeadroom>['length'], 0 | 1>>;
type Contract64 = Assert<Equal<Parameters<typeof Native0.useScrollDirection>['length'], 0>>;
type Contract65 = Assert<Equal<Parameters<typeof Native0.useEyeDropper>['length'], 0>>;
type Contract66 = Assert<Equal<Parameters<typeof Native0.useInViewport>['length'], 0>>;
type Contract67 = Assert<Equal<Parameters<typeof Native0.useMutationObserver>['length'], 2>>;
type Contract68 = Assert<
	Equal<Parameters<typeof Native0.useMutationObserverTarget>['length'], 2 | 3>
>;
type Contract69 = Assert<Equal<Parameters<typeof Native0.useMounted>['length'], 0>>;
type Contract70 = Assert<Equal<Parameters<typeof Native0.useStateHistory>['length'], 1>>;
type Contract71 = Assert<Equal<Parameters<typeof Native0.useMap>['length'], 0 | 1>>;
type Contract72 = Assert<Equal<Parameters<typeof Native0.useSet>['length'], 0 | 1>>;
type Contract73 = Assert<Equal<Parameters<typeof Native0.useThrottledCallback>['length'], 2>>;
type Contract74 = Assert<Equal<Parameters<typeof Native0.useThrottledState>['length'], 2>>;
type Contract75 = Assert<Equal<Parameters<typeof Native0.useThrottledValue>['length'], 2>>;
type Contract76 = Assert<Equal<Parameters<typeof Native0.useIsFirstRender>['length'], 0>>;
type Contract77 = Assert<Equal<Parameters<typeof Native0.useOrientation>['length'], 0 | 1>>;
type Contract78 = Assert<Equal<Parameters<typeof Native0.useFetch>['length'], 1 | 2>>;
type Contract79 = Assert<Equal<Parameters<typeof Native0.useRadialMove>['length'], 1 | 2>>;
type Contract80 = Assert<Equal<Parameters<typeof Native0.normalizeRadialValue>['length'], 2>>;
type Contract81 = Assert<Equal<Parameters<typeof Native0.useScrollSpy>['length'], 0 | 1>>;
type Contract82 = Assert<Equal<Parameters<typeof Native0.useScroller>['length'], 0 | 1>>;
type Contract83 = Assert<Equal<Parameters<typeof Native0.useFileDialog>['length'], 0 | 1>>;
type Contract84 = Assert<Equal<Parameters<typeof Native0.useLongPress>['length'], 1 | 2>>;
type Contract85 = Assert<Equal<Parameters<typeof Native0.useSelection>['length'], 1>>;
type Contract86 = Assert<Equal<Parameters<typeof Native0.useFloatingWindow>['length'], 0 | 1>>;
type Contract87 = Assert<Equal<Parameters<typeof Native0.useCollapse>['length'], 1>>;
type Contract88 = Assert<Equal<Parameters<typeof Native0.useHorizontalCollapse>['length'], 1>>;
type Contract89 = Assert<Equal<Parameters<typeof Native0.useMask>['length'], 1>>;
type Contract90 = Assert<Equal<Parameters<typeof Native0.formatMask>['length'], 2>>;
type Contract91 = Assert<Equal<Parameters<typeof Native0.unformatMask>['length'], 2>>;
type Contract92 = Assert<Equal<Parameters<typeof Native0.isMaskComplete>['length'], 2>>;
type Contract93 = Assert<Equal<Parameters<typeof Native0.generatePattern>['length'], 2>>;
type Contract94 = Assert<Equal<Parameters<typeof Native0.useRovingIndex>['length'], 1>>;
type Contract95 = Assert<Equal<Parameters<typeof Native0.useDrag>['length'], 1 | 2>>;
type Contract96 = Assert<Equal<Parameters<typeof Native0.useSplitter>['length'], 1>>;
type Contract97 = Assert<
	Equal<keyof Pick<Native0.UseMediaQueryOptions, PublishedKeys0>, PublishedKeys0>
>;
type Contract98 = Assert<
	Equal<keyof Pick<Native0.UseClipboardOptions, PublishedKeys1>, PublishedKeys1>
>;
type Contract99 = Assert<
	Equal<keyof Pick<Native0.UseClipboardReturnValue, PublishedKeys2>, PublishedKeys2>
>;
type Contract100 = Assert<
	Equal<keyof Pick<Native0.UseColorSchemeValue, PublishedKeys3>, PublishedKeys3>
>;
type Contract101 = Assert<
	Equal<keyof Pick<Native0.UseCounterOptions, PublishedKeys4>, PublishedKeys4>
>;
type Contract102 = Assert<
	Equal<keyof Pick<Native0.UseCounterHandlers, PublishedKeys5>, PublishedKeys5>
>;
type Contract103 = Assert<
	Equal<keyof Pick<Native0.UseCounterReturnValue, PublishedKeys6>, PublishedKeys6>
>;
type Contract104 = Assert<
	Equal<keyof Pick<Native0.UseDebouncedCallbackOptions, PublishedKeys7>, PublishedKeys7>
>;
type Contract105 = Assert<
	Equal<Parameters<Native0.UseDebouncedCallbackReturnValue<(value: string) => number>>['length'], 1>
>;
type Contract106 = Assert<
	Equal<keyof Pick<Native0.UseDebouncedStateOptions, PublishedKeys8>, PublishedKeys8>
>;
type Contract107 = Assert<
	Equal<
		keyof Pick<Native0.UseDebouncedStateReturnValue<{ sample: string }>, PublishedKeys6>,
		PublishedKeys6
	>
>;
type Contract108 = Assert<
	Equal<keyof Pick<Native0.UseDebouncedValueHandlers, PublishedKeys9>, PublishedKeys9>
>;
type Contract109 = Assert<
	Equal<keyof Pick<Native0.UseDebouncedValueOptions, PublishedKeys8>, PublishedKeys8>
>;
type Contract110 = Assert<
	Equal<
		keyof Pick<Native0.UseDebouncedValueReturnValue<{ sample: string }>, PublishedKeys10>,
		PublishedKeys10
	>
>;
type Contract111 = Assert<
	Equal<keyof Pick<Native0.UseDisclosureOptions, PublishedKeys11>, PublishedKeys11>
>;
type Contract112 = Assert<
	Equal<keyof Pick<Native0.UseDisclosureHandlers, PublishedKeys12>, PublishedKeys12>
>;
type Contract113 = Assert<
	Equal<keyof Pick<Native0.UseDisclosureReturnValue, PublishedKeys6>, PublishedKeys6>
>;
type Contract114 = Assert<
	Equal<keyof Pick<Native0.EyeDropperOpenOptions, PublishedKeys13>, PublishedKeys13>
>;
type Contract115 = Assert<
	Equal<keyof Pick<Native0.EyeDropperOpenReturnType, PublishedKeys14>, PublishedKeys14>
>;
type Contract116 = Assert<
	Equal<keyof Pick<Native0.UseEyeDropperReturnValue, PublishedKeys15>, PublishedKeys15>
>;
type Contract117 = Assert<
	Equal<keyof Pick<Native0.UseFetchOptions, PublishedKeys16>, PublishedKeys16>
>;
type Contract118 = Assert<
	Equal<
		keyof Pick<Native0.UseFetchReturnValue<{ sample: string }>, PublishedKeys17>,
		PublishedKeys17
	>
>;
type Contract119 = Assert<
	Equal<keyof Pick<Native0.UseFileDialogOptions, PublishedKeys18>, PublishedKeys18>
>;
type Contract120 = Assert<
	Equal<keyof Pick<Native0.UseFileDialogReturnValue, PublishedKeys19>, PublishedKeys19>
>;
type Contract121 = Assert<
	Equal<keyof Pick<Native0.UseFocusReturnOptions, PublishedKeys20>, PublishedKeys20>
>;
type Contract122 = Assert<Equal<Parameters<Native0.UseFocusReturnReturnValue>['length'], 0>>;
type Contract123 = Assert<
	Equal<keyof Pick<Native0.UseFocusWithinOptions, PublishedKeys21>, PublishedKeys21>
>;
type Contract124 = Assert<
	Equal<keyof Pick<Native0.UseFocusWithinReturnValue, PublishedKeys22>, PublishedKeys22>
>;
type Contract125 = Assert<
	Equal<keyof Pick<Native0.UseFullscreenElementReturnValue, PublishedKeys23>, PublishedKeys23>
>;
type Contract126 = Assert<
	Equal<keyof Pick<Native0.UseHashOptions, PublishedKeys0>, PublishedKeys0>
>;
type Contract127 = Assert<
	Equal<keyof Pick<Native0.UseHashReturnValue, PublishedKeys6>, PublishedKeys6>
>;
type Contract128 = Assert<
	Equal<keyof Pick<Native0.UseHeadroomOptions, PublishedKeys24>, PublishedKeys24>
>;
type Contract129 = Assert<
	Equal<keyof Pick<Native0.ScrollDirection, PublishedKeys3>, PublishedKeys3>
>;
type Contract130 = Assert<
	Equal<keyof Pick<Native0.HotkeyItemOptions, PublishedKeys25>, PublishedKeys25>
>;
type Contract131 = Assert<Equal<keyof Pick<Native0.HotkeyItem, PublishedKeys10>, PublishedKeys10>>;
type Contract132 = Assert<
	Equal<keyof Pick<Native0.UseHoverReturnValue, PublishedKeys26>, PublishedKeys26>
>;
type Contract133 = Assert<
	Equal<keyof Pick<Native0.UseIdleOptions, PublishedKeys27>, PublishedKeys27>
>;
type Contract134 = Assert<
	Equal<keyof Pick<Native0.UseInViewportReturnValue, PublishedKeys28>, PublishedKeys28>
>;
type Contract135 = Assert<
	Equal<
		keyof Pick<Native0.UseInputStateReturnValue<{ sample: string }>, PublishedKeys6>,
		PublishedKeys6
	>
>;
type Contract136 = Assert<
	Equal<
		keyof Pick<Native0.UseIntersectionReturnValue<{ sample: string }>, PublishedKeys29>,
		PublishedKeys29
	>
>;
type Contract137 = Assert<
	Equal<keyof Pick<Native0.UseIntervalOptions, PublishedKeys30>, PublishedKeys30>
>;
type Contract138 = Assert<
	Equal<keyof Pick<Native0.UseIntervalReturnValue, PublishedKeys31>, PublishedKeys31>
>;
type Contract139 = Assert<
	Equal<
		keyof Pick<Native0.UseListStateReturnValue<{ sample: string }>, PublishedKeys6>,
		PublishedKeys6
	>
>;
type Contract140 = Assert<
	Equal<
		keyof Pick<Native0.UseListStateHandlers<{ sample: string }>, PublishedKeys32>,
		PublishedKeys32
	>
>;
type Contract141 = Assert<
	Equal<keyof Pick<Native0.UseStorageOptions<{ sample: string }>, PublishedKeys33>, PublishedKeys33>
>;
type Contract142 = Assert<
	Equal<
		keyof Pick<Native0.UseStorageReturnValue<{ sample: string }>, PublishedKeys10>,
		PublishedKeys10
	>
>;
type Contract143 = Assert<
	Equal<keyof Pick<Native0.UseMovePosition, PublishedKeys34>, PublishedKeys34>
>;
type Contract144 = Assert<
	Equal<keyof Pick<Native0.UseMoveHandlers, PublishedKeys35>, PublishedKeys35>
>;
type Contract145 = Assert<
	Equal<keyof Pick<Native0.UseMoveReturnValue, PublishedKeys36>, PublishedKeys36>
>;
type Contract146 = Assert<
	Equal<keyof Pick<Native0.UserNetworkReturnValue, PublishedKeys37>, PublishedKeys37>
>;
type Contract147 = Assert<
	Equal<keyof Pick<Native0.UseOrientationOptions, PublishedKeys38>, PublishedKeys38>
>;
type Contract148 = Assert<
	Equal<keyof Pick<Native0.UseOrientationReturnType, PublishedKeys39>, PublishedKeys39>
>;
type Contract149 = Assert<
	Equal<keyof Pick<Native0.UseOSReturnValue, PublishedKeys3>, PublishedKeys3>
>;
type Contract150 = Assert<
	Equal<keyof Pick<Native0.UseOsOptions, PublishedKeys40>, PublishedKeys40>
>;
type Contract151 = Assert<
	Equal<keyof Pick<Native0.UsePaginationOptions, PublishedKeys41>, PublishedKeys41>
>;
type Contract152 = Assert<
	Equal<keyof Pick<Native0.UsePaginationReturnValue, PublishedKeys42>, PublishedKeys42>
>;
type Contract153 = Assert<
	Equal<keyof Pick<Native0.UseQueueOptions<{ sample: string }>, PublishedKeys43>, PublishedKeys43>
>;
type Contract154 = Assert<
	Equal<
		keyof Pick<Native0.UseQueueReturnValue<{ sample: string }>, PublishedKeys44>,
		PublishedKeys44
	>
>;
type Contract155 = Assert<
	Equal<keyof Pick<Native0.UseRadialMoveOptions, PublishedKeys45>, PublishedKeys45>
>;
type Contract156 = Assert<
	Equal<keyof Pick<Native0.UseRadialMoveReturnValue, PublishedKeys36>, PublishedKeys36>
>;
type Contract157 = Assert<
	Equal<keyof Pick<Native0.UseScrollIntoViewOptions, PublishedKeys46>, PublishedKeys46>
>;
type Contract158 = Assert<
	Equal<keyof Pick<Native0.UseScrollIntoViewReturnValue, PublishedKeys47>, PublishedKeys47>
>;
type Contract159 = Assert<
	Equal<keyof Pick<Native0.UseScrollSpyOptions, PublishedKeys48>, PublishedKeys48>
>;
type Contract160 = Assert<
	Equal<keyof Pick<Native0.UseScrollSpyHeadingData, PublishedKeys49>, PublishedKeys49>
>;
type Contract161 = Assert<
	Equal<keyof Pick<Native0.UseScrollSpyReturnValue, PublishedKeys50>, PublishedKeys50>
>;
type Contract162 = Assert<
	Equal<keyof Pick<Native0.UseScrollerOptions, PublishedKeys51>, PublishedKeys51>
>;
type Contract163 = Assert<
	Equal<keyof Pick<Native0.UseScrollerReturnValue, PublishedKeys52>, PublishedKeys52>
>;
type Contract164 = Assert<
	Equal<keyof Pick<Native0.UseScrollerScrollState, PublishedKeys53>, PublishedKeys53>
>;
type Contract165 = Assert<
	Equal<Parameters<Native0.UseSetStateCallback<{ sample: string }>>['length'], 1>
>;
type Contract166 = Assert<
	Equal<
		keyof Pick<Native0.UseSetStateReturnValue<{ sample: string }>, PublishedKeys6>,
		PublishedKeys6
	>
>;
type Contract167 = Assert<
	Equal<
		keyof Pick<Native0.UseStateHistoryHandlers<{ sample: string }>, PublishedKeys54>,
		PublishedKeys54
	>
>;
type Contract168 = Assert<
	Equal<keyof Pick<Native0.StateHistory<{ sample: string }>, PublishedKeys55>, PublishedKeys55>
>;
type Contract169 = Assert<
	Equal<
		keyof Pick<Native0.UseStateHistoryValue<{ sample: string }>, PublishedKeys55>,
		PublishedKeys55
	>
>;
type Contract170 = Assert<
	Equal<
		keyof Pick<Native0.UseStateHistoryReturnValue<{ sample: string }>, PublishedKeys10>,
		PublishedKeys10
	>
>;
type Contract171 = Assert<
	Equal<keyof Pick<Native0.UseTimeoutOptions, PublishedKeys30>, PublishedKeys30>
>;
type Contract172 = Assert<
	Equal<keyof Pick<Native0.UseTimeoutReturnValue, PublishedKeys56>, PublishedKeys56>
>;
type Contract173 = Assert<
	Equal<
		keyof Pick<Native0.UseToggleReturnValue<{ sample: string }>, PublishedKeys6>,
		PublishedKeys6
	>
>;
type Contract174 = Assert<
	Equal<
		keyof Pick<Native0.UseUncontrolledOptions<{ sample: string }>, PublishedKeys57>,
		PublishedKeys57
	>
>;
type Contract175 = Assert<
	Equal<
		keyof Pick<Native0.UseUncontrolledReturnValue<{ sample: string }>, PublishedKeys10>,
		PublishedKeys10
	>
>;
type Contract176 = Assert<
	Equal<
		keyof Pick<Native0.UseValidatedStateValue<{ sample: string }>, PublishedKeys58>,
		PublishedKeys58
	>
>;
type Contract177 = Assert<
	Equal<
		keyof Pick<Native0.UseValidatedStateReturnValue<{ sample: string }>, PublishedKeys6>,
		PublishedKeys6
	>
>;
type Contract178 = Assert<
	Equal<keyof Pick<Native0.UseWindowScrollPosition, PublishedKeys34>, PublishedKeys34>
>;
type Contract179 = Assert<Equal<Parameters<Native0.UseWindowScrollTo>['length'], 1>>;
type Contract180 = Assert<
	Equal<keyof Pick<Native0.UseWindowScrollReturnValue, PublishedKeys6>, PublishedKeys6>
>;
type Contract181 = Assert<
	Equal<keyof Pick<Native0.UseLongPressEvent, PublishedKeys3>, PublishedKeys3>
>;
type Contract182 = Assert<
	Equal<keyof Pick<Native0.UseLongPressOptions, PublishedKeys59>, PublishedKeys59>
>;
type Contract183 = Assert<
	Equal<keyof Pick<Native0.UseLongPressReturnValue, PublishedKeys60>, PublishedKeys60>
>;
type Contract184 = Assert<Equal<Parameters<Native0.SetFloatingWindowPosition>['length'], 1>>;
type Contract185 = Assert<
	Equal<keyof Pick<Native0.UseFloatingWindowOptions, PublishedKeys61>, PublishedKeys61>
>;
type Contract186 = Assert<
	Equal<
		keyof Pick<Native0.UseFloatingWindowReturnValue<HTMLDivElement>, PublishedKeys62>,
		PublishedKeys62
	>
>;
type Contract187 = Assert<
	Equal<
		keyof Pick<Native0.UseSelectionHandlers<{ sample: string }>, PublishedKeys63>,
		PublishedKeys63
	>
>;
type Contract188 = Assert<
	Equal<keyof Pick<Native0.UseSelectionInput<{ sample: string }>, PublishedKeys64>, PublishedKeys64>
>;
type Contract189 = Assert<
	Equal<
		keyof Pick<Native0.UseSelectionReturnValue<{ sample: string }>, PublishedKeys65>,
		PublishedKeys65
	>
>;
type Contract190 = Assert<
	Equal<keyof Pick<Native0.UseElementSizeReturnValue, PublishedKeys66>, PublishedKeys66>
>;
type Contract191 = Assert<
	Equal<keyof Pick<Native0.UseResizeObserverReturnValue, PublishedKeys6>, PublishedKeys6>
>;
type Contract192 = Assert<
	Equal<keyof Pick<Native0.ObserverRect, PublishedKeys67>, PublishedKeys67>
>;
type Contract193 = Assert<
	Equal<keyof Pick<Native0.UseCollapseInput, PublishedKeys68>, PublishedKeys68>
>;
type Contract194 = Assert<
	Equal<keyof Pick<Native0.UseCollapseReturnValue, PublishedKeys69>, PublishedKeys69>
>;
type Contract195 = Assert<
	Equal<keyof Pick<Native0.UseCollapseState, PublishedKeys3>, PublishedKeys3>
>;
type Contract196 = Assert<
	Equal<keyof Pick<Native0.UseHorizontalCollapseInput, PublishedKeys68>, PublishedKeys68>
>;
type Contract197 = Assert<
	Equal<keyof Pick<Native0.UseHorizontalCollapseReturnValue, PublishedKeys69>, PublishedKeys69>
>;
type Contract198 = Assert<
	Equal<keyof Pick<Native0.UseHorizontalCollapseState, PublishedKeys3>, PublishedKeys3>
>;
type Contract199 = Assert<
	Equal<keyof Pick<Native0.UseMaskOptions, PublishedKeys70>, PublishedKeys70>
>;
type Contract200 = Assert<
	Equal<keyof Pick<Native0.UseMaskReturnValue, PublishedKeys71>, PublishedKeys71>
>;
type Contract201 = Assert<Equal<keyof Pick<Native0.MaskState, PublishedKeys72>, PublishedKeys72>>;
type Contract202 = Assert<
	Equal<keyof Pick<Native0.UseRovingIndexInput, PublishedKeys73>, PublishedKeys73>
>;
type Contract203 = Assert<
	Equal<keyof Pick<Native0.UseRovingIndexGetItemPropsInput, PublishedKeys74>, PublishedKeys74>
>;
type Contract204 = Assert<
	Equal<keyof Pick<Native0.UseRovingIndexReturnValue, PublishedKeys75>, PublishedKeys75>
>;
type Contract205 = Assert<
	Equal<keyof Pick<Native0.UseDragState, PublishedKeys76>, PublishedKeys76>
>;
type Contract206 = Assert<
	Equal<keyof Pick<Native0.UseDragOptions, PublishedKeys77>, PublishedKeys77>
>;
type Contract207 = Assert<
	Equal<keyof Pick<Native0.UseDragReturnValue, PublishedKeys36>, PublishedKeys36>
>;
type Contract208 = Assert<
	Equal<keyof Pick<Native0.UseSplitterPanel, PublishedKeys78>, PublishedKeys78>
>;
type Contract209 = Assert<
	Equal<keyof Pick<Native0.UseSplitterOptions, PublishedKeys79>, PublishedKeys79>
>;
type Contract210 = Assert<
	Equal<keyof Pick<Native0.UseSplitterReturnValue, PublishedKeys80>, PublishedKeys80>
>;
type Contract211 = Assert<
	Equal<keyof Pick<Native0.UseSplitterRedistributeInput, PublishedKeys81>, PublishedKeys81>
>;
type Contract212 = Assert<Equal<Parameters<Native0.UseSplitterRedistributeFn>['length'], 1>>;
type Contract213 = Assert<
	Equal<keyof Pick<Native0.UseSplitterResolvedPanel, PublishedKeys78>, PublishedKeys78>
>;
type Contract214 = Assert<
	Equal<keyof Pick<Native0.SplitterPaneSize, PublishedKeys82>, PublishedKeys82>
>;
type Contract215 = Assert<
	Equal<keyof Pick<Native0.SplitterStep, PublishedKeys82>, PublishedKeys82>
>;
type Contract216 = Assert<Equal<Parameters<typeof Native0.clamp>['length'], 3>>;
type Contract217 = Assert<Equal<Parameters<typeof Native0.lowerFirst>['length'], 1>>;
type Contract218 = Assert<Equal<Parameters<typeof Native0.randomId>['length'], 0 | 1>>;
type Contract219 = Assert<Equal<Parameters<typeof Native0.range>['length'], 2>>;
type Contract220 = Assert<Equal<Parameters<typeof Native0.shallowEqual>['length'], 2>>;
type Contract221 = Assert<Equal<Parameters<typeof Native0.upperFirst>['length'], 1>>;
type Contract222 = Assert<Equal<Parameters<typeof Native0.useCallbackRef>['length'], 1>>;
