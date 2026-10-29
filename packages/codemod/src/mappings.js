/**
 * What each React module name means in Octane.
 *
 * Values and types are listed separately because Octane exports React's type
 * names as migration aliases (`ReactNode`, `ChangeEvent`, `FC`, ...), while
 * several React values have no Octane counterpart at all and need a rewrite or a
 * person (`forwardRef`, class components, `createRef`).
 */

/** React value exports that exist in `octane` under the same name. */
const OCTANE_VALUES = new Set([
	'Activity',
	'Children',
	'Fragment',
	'StrictMode',
	'Suspense',
	'ViewTransition',
	'act',
	'addTransitionType',
	'cloneElement',
	'createContext',
	'createElement',
	'createPortal',
	'createRoot',
	'flushSync',
	'hydrateRoot',
	'isValidElement',
	'lazy',
	'memo',
	'preconnect',
	'prefetchDNS',
	'preinit',
	'preinitModule',
	'preload',
	'preloadModule',
	'requestFormReset',
	'startTransition',
	'unstable_Activity',
	'unstable_ViewTransition',
	'unstable_addTransitionType',
	'unstable_batchedUpdates',
	'use',
	'useActionState',
	'useCallback',
	'useContext',
	'useDebugValue',
	'useDeferredValue',
	'useEffect',
	'useEffectEvent',
	'useFormState',
	'useFormStatus',
	'useId',
	'useImperativeHandle',
	'useInsertionEffect',
	'useLayoutEffect',
	'useMemo',
	'useOptimistic',
	'useReducer',
	'useRef',
	'useState',
	'useSyncExternalStore',
	'useTransition',
	'version',
]);

/** `react-dom/server` names served by `octane/server`. */
const OCTANE_SERVER_VALUES = new Set([
	'renderToPipeableStream',
	'renderToReadableStream',
	'renderToStaticMarkup',
	'renderToString',
]);

/** React type names `octane` exports as-is. */
const OCTANE_TYPES = new Set(
	(
		'AllHTMLAttributes AnchorHTMLAttributes AnimationEvent AnimationEventHandler AreaHTMLAttributes ' +
		'AriaAttributes AriaRole Attributes AudioHTMLAttributes BaseHTMLAttributes BlockquoteHTMLAttributes ' +
		'Booleanish ButtonHTMLAttributes CSSProperties CanvasHTMLAttributes ChangeEvent ChangeEventHandler ' +
		'ClipboardEvent ClipboardEventHandler ColHTMLAttributes ColgroupHTMLAttributes ComponentProps ' +
		'ComponentPropsWithRef ComponentPropsWithoutRef ComponentRef ComponentType CompositionEvent ' +
		'CompositionEventHandler Context ContextType CrossOrigin CustomComponentPropsWithRef DOMAttributes ' +
		'DOMElement DataHTMLAttributes DelHTMLAttributes DependencyList Destructor DetailedHTMLProps ' +
		'DetailedReactHTMLElement DetailsHTMLAttributes DialogHTMLAttributes Dispatch DispatchWithoutAction ' +
		'DragEvent DragEventHandler EffectCallback ElementRef ElementType EmbedHTMLAttributes EventHandler ' +
		'ExoticComponent FC FieldsetHTMLAttributes FocusEvent FocusEventHandler FormEvent FormEventHandler ' +
		'FormHTMLAttributes FunctionComponent FunctionComponentElement HTMLAttributeAnchorTarget ' +
		'HTMLAttributeReferrerPolicy HTMLAttributes HTMLInputTypeAttribute HTMLProps HtmlHTMLAttributes ' +
		'IframeHTMLAttributes ImgHTMLAttributes InputEvent InputEventHandler InputHTMLAttributes ' +
		'InsHTMLAttributes InvalidEvent InvalidEventHandler JSX JSXElementConstructor Key KeyboardEvent ' +
		'KeyboardEventHandler KeygenHTMLAttributes LabelHTMLAttributes LazyExoticComponent LiHTMLAttributes ' +
		'LinkHTMLAttributes MapHTMLAttributes MemoExoticComponent MenuHTMLAttributes MetaHTMLAttributes ' +
		'MeterHTMLAttributes MouseEvent MouseEventHandler MutableRefObject NamedExoticComponent ' +
		'ObjectHTMLAttributes OlHTMLAttributes OptgroupHTMLAttributes OptionHTMLAttributes ' +
		'OutputHTMLAttributes ParamHTMLAttributes PointerEvent PointerEventHandler ProgressHTMLAttributes ' +
		'PropsWithChildren PropsWithRef PropsWithoutRef Provider ProviderProps QuoteHTMLAttributes ' +
		'ReactElement ReactHTMLElement ReactNode ReactPortal ReactSVGElement Reducer ReducerAction ' +
		'ReducerState ReducerStateWithoutAction ReducerWithoutAction Ref RefAttributes RefCallback RefObject ' +
		'SVGAttributes SVGLineElementAttributes SVGProps SVGTextElementAttributes ScriptHTMLAttributes ' +
		'SelectHTMLAttributes SetStateAction SlotHTMLAttributes SourceHTMLAttributes StrictModeProps ' +
		'StyleHTMLAttributes SuspenseProps TableHTMLAttributes TdHTMLAttributes TextareaHTMLAttributes ' +
		'ThHTMLAttributes TimeHTMLAttributes ToggleEvent ToggleEventHandler TouchEvent TouchEventHandler ' +
		'TrackHTMLAttributes TransitionEvent TransitionEventHandler UIEvent UIEventHandler ' +
		'VideoHTMLAttributes WebViewHTMLAttributes WheelEvent WheelEventHandler'
	).split(' '),
);

/**
 * React type names with an Octane spelling of their own. `ReactNode` keeps its
 * alias when imported by name, so only namespace-qualified uses change; the
 * rest have no alias in Octane.
 *
 * @type {Record<string, string>}
 */
const RENAMED_TYPES = {
	BaseSyntheticEvent: 'NativeEvent',
	ForwardRefExoticComponent: 'FC',
	ForwardedRef: 'Ref',
	LegacyRef: 'Ref',
	ReactChild: 'OctaneNode',
	ReactFragment: 'OctaneNode',
	ReactText: 'OctaneNode',
	SyntheticEvent: 'NativeEvent',
};

/** Namespace-qualified spellings that read better as Octane's own name. *
 * @type {Record<string, string>}
 */
const QUALIFIED_TYPE_PREFERENCES = {
	ReactElement: 'OctaneElement',
	ReactNode: 'OctaneNode',
};

/** Modules whose imports this codemod owns, and the Octane module each becomes. *
 * @type {Record<string, string>}
 */
export const REACT_MODULES = {
	react: 'octane',
	'react-dom': 'octane',
	'react-dom/client': 'octane',
	'react-dom/server': 'octane/server',
	'react-dom/server.browser': 'octane/server',
	'react-dom/server.bun': 'octane/server',
	'react-dom/server.edge': 'octane/server',
	'react-dom/server.node': 'octane/server',
	'react-dom/test-utils': 'octane',
	'react/jsx-runtime': 'octane/jsx-runtime',
	'react/jsx-dev-runtime': 'octane/jsx-dev-runtime',
	// React's `useSyncExternalStore` for React 17 and earlier.
	'use-sync-external-store': 'octane',
	'use-sync-external-store/shim': 'octane',
};

/**
 * React framework packages an Octane framework integration serves. They are
 * not bindings, so the shared binding catalog leaves them out.
 */
export const FRAMEWORK_PACKAGES = /** @type {Record<string, string>} */ ({
	'@tanstack/react-start': '@octanejs/tanstack-start',
});

/**
 * React values with no Octane export, each with what to do instead. A value
 * listed here is never imported from Octane; the codemod either rewrites its
 * uses or reports them.
 *
 * @type {Record<string, string>}
 */
export const UNSUPPORTED_VALUES = {
	Component: 'Class components are not supported. Convert it to a function component.',
	PureComponent:
		'Class components are not supported. Convert it to a function component with `memo`.',
	Profiler: 'Octane has no `Profiler`; use the Octane devtools profiler.',
	SuspenseList: 'Octane has no `SuspenseList`.',
	cache: 'Server Components are not supported, so `cache` has no Octane equivalent.',
	cacheSignal: 'Server Components are not supported, so `cacheSignal` has no Octane equivalent.',
	captureOwnerStack: 'Octane does not collect owner stacks.',
	createRef:
		'Octane has no `createRef`; use `useRef` in a function component or a `{ current: null }` object.',
	findDOMNode: 'Octane has no `findDOMNode`; pass a ref to the host element.',
	forwardRef: 'Refs are props in Octane; the codemod unwraps `forwardRef` where it can.',
	hydrate: 'Legacy roots are not supported; the codemod rewrites calls to `hydrateRoot`.',
	render: 'Legacy roots are not supported; the codemod rewrites calls to `createRoot(...).render`.',
	unmountComponentAtNode:
		'Legacy roots are not supported; keep the `createRoot` result and call `root.unmount()`.',
};

/**
 * @param {string} module a key of {@link REACT_MODULES}
 * @param {string} name the imported name
 * @param {boolean} typeOnly
 * @returns {{ module: string, name: string } | null} null when Octane has no
 *   such export
 */
export function mapReactImport(module, name, typeOnly) {
	if (module === 'react-dom/server' || module.startsWith('react-dom/server.')) {
		return OCTANE_SERVER_VALUES.has(name) ? { module: 'octane/server', name } : null;
	}
	if (!typeOnly && OCTANE_VALUES.has(name)) return { module: 'octane', name };
	if (OCTANE_TYPES.has(name)) return { module: 'octane', name };
	if (name in RENAMED_TYPES) return { module: 'octane', name: RENAMED_TYPES[name] };
	return null;
}

/**
 * The Octane name for `React.<name>` in a type position.
 *
 * @param {string} name
 * @returns {string | null}
 */
export function mapQualifiedType(name) {
	if (name in QUALIFIED_TYPE_PREFERENCES) return QUALIFIED_TYPE_PREFERENCES[name];
	if (OCTANE_TYPES.has(name)) return name;
	return RENAMED_TYPES[name] ?? null;
}

/** Built-in hooks whose omitted dependency list Octane infers. *
 * @type {Record<string, number>}
 */
export const DEPENDENCY_HOOKS = {
	useCallback: 1,
	useEffect: 1,
	useImperativeHandle: 2,
	useInsertionEffect: 1,
	useLayoutEffect: 1,
	useMemo: 1,
};

/** `<input type>` values whose native `change` fires on commit, not per edit. */
export const TEXT_INPUT_TYPES = new Set([
	'text',
	'search',
	'url',
	'tel',
	'password',
	'email',
	'number',
]);
