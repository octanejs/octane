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
};

/**
 * What `@octanejs/radix` exports in each namespace. A namespace ports the
 * `@radix-ui/react-*` package it names, as `Dialog` ports
 * `@radix-ui/react-dialog`, except `Slot`, whose exports are the binding's own.
 * A codemod test checks it against the binding and the Radix packages.
 *
 * @type {Record<string, Set<string>>}
 */
const RADIX = Object.fromEntries(
	Object.entries({
		AccessibleIcon: 'AccessibleIcon Root',
		Accordion: 'Accordion Content Header Item Root Trigger createAccordionScope',
		AlertDialog:
			'Action AlertDialog Cancel Content Description Overlay Portal Root Title Trigger createAlertDialogScope',
		Arrow: 'Arrow Root',
		AspectRatio: 'AspectRatio Root',
		Avatar: 'Avatar AvatarFallback AvatarImage Fallback Image Root createAvatarScope',
		Checkbox:
			'BubbleInput Checkbox CheckboxBubbleInput CheckboxIndicator CheckboxProvider CheckboxTrigger CheckedState Indicator Provider Root Trigger createCheckboxScope',
		Collapsible:
			'Collapsible Content Root Trigger createCollapsibleContext createCollapsibleScope useCollapsibleContext',
		ContextMenu:
			'Arrow CheckboxItem Content ContextMenu ContextMenuContent ContextMenuItem ContextMenuTrigger Group Item ItemIndicator Label Portal RadioGroup RadioItem Root Separator Sub SubContent SubTrigger Trigger createContextMenuScope',
		Dialog:
			'Close Content Description Dialog Overlay Portal Root Title Trigger createDialogContext createDialogScope',
		Direction: 'DirectionProvider Provider useDirection',
		DropdownMenu:
			'Arrow CheckboxItem Content DropdownMenu DropdownMenuContent DropdownMenuItem DropdownMenuTrigger Group Item ItemIndicator Label Portal RadioGroup RadioItem Root Separator Sub SubContent SubTrigger Trigger createDropdownMenuScope',
		Form: 'Control Field Form FormControl FormField FormLabel FormMessage FormSubmit FormValidityState Label Message Root Submit ValidityState createFormScope',
		HoverCard:
			'Arrow Content HoverCard HoverCardContent HoverCardTrigger Portal Root Trigger createHoverCardScope',
		Label: 'Label Root',
		Menu: 'Anchor Arrow CheckboxItem Content Group Item ItemIndicator Label Menu MenuAnchor MenuContent MenuItem Portal RadioGroup RadioItem Root Separator Sub SubContent SubTrigger createMenuScope',
		Menubar:
			'Arrow CheckboxItem Content Group Item ItemIndicator Label Menu Menubar MenubarArrow MenubarCheckboxItem MenubarContent MenubarGroup MenubarItem MenubarItemIndicator MenubarLabel MenubarMenu MenubarPortal MenubarRadioGroup MenubarRadioItem MenubarSeparator MenubarSub MenubarSubContent MenubarSubTrigger MenubarTrigger Portal RadioGroup RadioItem Root Separator Sub SubContent SubTrigger Trigger createMenubarScope',
		NavigationMenu:
			'Content Indicator Item Link List NavigationMenu NavigationMenuContent NavigationMenuIndicator NavigationMenuItem NavigationMenuLink NavigationMenuList NavigationMenuSub NavigationMenuTrigger NavigationMenuViewport Root Sub Trigger Viewport createNavigationMenuScope',
		OneTimePasswordField:
			'HiddenInput Input InputValidationType OneTimePasswordField OneTimePasswordFieldHiddenInput OneTimePasswordFieldInput Root createOneTimePasswordFieldScope',
		PasswordToggleField:
			'Icon Input PasswordToggleField PasswordToggleFieldIcon PasswordToggleFieldInput PasswordToggleFieldSlot PasswordToggleFieldToggle Root Slot Toggle createPasswordToggleFieldScope',
		Popover:
			'Anchor Arrow Close Content Popover PopoverAnchor PopoverTrigger Portal Root Trigger createPopoverScope',
		Popper:
			'ALIGN_OPTIONS Anchor Arrow Content Popper PopperAnchor PopperArrow PopperContent Root SIDE_OPTIONS createPopperScope',
		Portal: 'Portal Root',
		Progress: 'Indicator Progress ProgressIndicator Root createProgressScope',
		RadioGroup:
			'Indicator Item RadioGroup RadioGroupIndicator RadioGroupItem RadioGroupItemBubbleInput RadioGroupItemProvider RadioGroupItemTrigger Root createRadioGroupScope',
		RovingFocus:
			'Item Root RovingFocusGroup RovingFocusGroupItem createRovingFocusGroupContext createRovingFocusGroupScope',
		ScrollArea:
			'Corner Root ScrollArea ScrollAreaCorner ScrollAreaScrollbar ScrollAreaThumb ScrollAreaViewport Scrollbar Thumb Viewport createScrollAreaScope',
		Select:
			'Arrow BubbleInput Content Group Icon Item ItemIndicator ItemText Label Portal Provider Root ScrollDownButton ScrollUpButton Select SelectArrow SelectBubbleInput SelectContent SelectGroup SelectIcon SelectItem SelectItemIndicator SelectItemText SelectLabel SelectPortal SelectProvider SelectScrollDownButton SelectScrollUpButton SelectSeparator SelectTrigger SelectValue SelectViewport Separator Trigger Value Viewport createSelectScope',
		Separator: 'Root Separator',
		Slider:
			'BubbleInput Range Root Slider SliderBubbleInput SliderRange SliderThumb SliderThumbProvider SliderThumbTrigger SliderTrack Thumb Track createSliderScope',
		Slot: 'Slot Slottable',
		Switch:
			'BubbleInput Provider Root Switch SwitchBubbleInput SwitchProvider SwitchThumb SwitchTrigger Thumb Trigger createSwitchScope',
		Tabs: 'Content List Root Tabs Trigger createTabsScope',
		Toast:
			'Action Close Description Provider Root Title Toast ToastAction ToastClose ToastDescription ToastProvider ToastTitle ToastViewport Viewport createToastScope',
		Toggle: 'Root Toggle',
		ToggleGroup: 'Item Root ToggleGroup ToggleGroupItem createToggleGroupScope',
		Toolbar:
			'Button Link Root Separator ToggleGroup ToggleItem Toolbar ToolbarButton ToolbarLink createToolbarScope',
		Tooltip:
			'Arrow Content Portal Provider Root Tooltip TooltipProvider Trigger createTooltipScope',
		VisuallyHidden: 'Root VISUALLY_HIDDEN_STYLES VisuallyHidden',
	}).map(([namespace, names]) => [namespace, new Set(names.split(' '))]),
);

/** The types among them, which a named import reads as an alias, not a value. */
export const RADIX_TYPES = new Set(['CheckedState', 'InputValidationType']);

/** Each Radix package the binding ports, and its namespace. */
const RADIX_PACKAGES = new Map(
	Object.keys(RADIX).map((namespace) => [
		`@radix-ui/react-${namespace.replace(/[A-Z]/g, (c, i) => (i ? '-' : '') + c.toLowerCase())}`,
		namespace,
	]),
);

/**
 * The adapters TanStack publishes for Octane, by the React adapter each
 * replaces, with the exports each lacks and what to do instead.
 *
 * @type {Record<string, Record<string, string>>}
 */
const TANSTACK_ADAPTERS = {
	'@tanstack/react-hotkeys': {},
	'@tanstack/react-pacer': {
		usePacerContext:
			"`@tanstack/octane-pacer` has no `usePacerContext`; read the provider's options with `useDefaultPacerOptions()`.",
	},
	'@tanstack/react-table': Object.fromEntries(
		(
			'getCoreRowModel getExpandedRowModel getFacetedMinMaxValues getFacetedRowModel ' +
			'getFacetedUniqueValues getFilteredRowModel getGroupedRowModel getPaginationRowModel ' +
			'getSortedRowModel legacyCreateColumnHelper sortingFns useLegacyTable useReactTable'
		)
			.split(' ')
			.map((name) => [
				name,
				`\`${name}\` is TanStack Table v8's API, which \`@tanstack/octane-table\` does not adapt: move to v9's \`useTable\`, with \`_features\` and \`_rowModels\`, first.`,
			]),
	),
};

/**
 * React packages ported outside the binding catalog: a framework integration,
 * TanStack's own adapters, and Radix's primitive packages, which
 * `@octanejs/radix` serves as namespaces.
 */
export const PORTED_PACKAGES = /** @type {Record<string, string>} */ ({
	'@tanstack/react-start': '@octanejs/tanstack-start',
	...Object.fromEntries(
		Object.keys(TANSTACK_ADAPTERS).map((name) => [name, name.replace('/react-', '/octane-')]),
	),
	...Object.fromEntries([...RADIX_PACKAGES.keys()].map((name) => [name, '@octanejs/radix'])),
});

/**
 * The `@octanejs/radix` namespace a Radix package's imports become, or null.
 * `@radix-ui/react-slot` has none: its exports are the binding's own.
 *
 * @param {string} module
 */
export function radixNamespace(module) {
	const namespace = RADIX_PACKAGES.get(module) ?? null;
	return namespace === 'Slot' ? null : namespace;
}

/**
 * The name an export of a ported package has in its port, or null when the
 * port has none. Other packages keep every name.
 *
 * @param {string} module
 * @param {string} name
 * @returns {string | null}
 */
export function mapPackageExport(module, name) {
	const namespace = RADIX_PACKAGES.get(module);
	if (namespace !== undefined) {
		const names = RADIX[namespace];
		if (names.has(name)) return name;
		// Radix exports each part twice, as `Content` and `DialogContent`, with
		// `Root` as `Dialog`, and a part still in preview as `unstable_Content`.
		const prefix = new RegExp(`^(?:unstable_)?(?:${namespace}(?![a-z]))?`);
		const part = (/** @type {string} */ name) => name.replace(prefix, '') || 'Root';
		const wanted = part(name);
		if (names.has(wanted)) return wanted;
		return [...names].find((candidate) => part(candidate) === wanted) ?? null;
	}
	const adapter = adapterOf(module);
	if (adapter === undefined) return name;
	if (Object.hasOwn(adapter, name)) return null;
	// The adapters name their framework in their types: `ReactTable` is `OctaneTable`.
	return name.replace(/React(?=[A-Z])/, 'Octane');
}

/**
 * Why the port of a ported package has no `name`.
 *
 * @param {string} module
 * @param {string} name
 */
export function missingExport(module, name) {
	const adapter = adapterOf(module);
	if (adapter !== undefined) return adapter[name];
	const namespace = RADIX_PACKAGES.get(module);
	return `\`@octanejs/radix\` has no \`${namespace === 'Slot' ? name : `${namespace}.${name}`}\`.`;
}

/**
 * The TanStack adapter a specifier imports, by its package.
 *
 * @param {string} module
 */
function adapterOf(module) {
	const name = module.split('/', 2).join('/');
	return Object.hasOwn(TANSTACK_ADAPTERS, name) ? TANSTACK_ADAPTERS[name] : undefined;
}

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
