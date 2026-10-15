/**
 * Every function in packages/octane/src/runtime.ts that writes native DOM, and
 * why that write is not a render writing committed DOM (#2043). A root render
 * computes; its commit writes. scripts/check-render-writes.mjs fails on a DOM
 * write in any function missing here, and on an entry that no longer writes.
 *
 *   commit     Runs from a root commit (its ops, commit functions or commit
 *              callbacks), or where no root render is open.
 *   primitive  A low-level writer. Its callers own the timing: commit
 *              functions, content this render created, or no open root render.
 *   fresh      Writes content this render created, in a template clone or a
 *              frontier fragment off-document. Committed structure it changes
 *              goes through the slot's pending structure (`next`, list logs,
 *              DeoptOrder) instead.
 *   hydration  Adopts or repairs server DOM while hydrating.
 *   unmount    Removes an unmounting tree outside a root render.
 *   native     Outside rendering: imperative handles, form and focus
 *              plumbing, ViewTransition naming in the native update, style
 *              injection, hot reload.
 *   hint       A React-parity resource hint, which inserts into
 *              document.head when called, mid-render included: preload,
 *              preinit and the rest, and the style preload a stylesheet
 *              resource issues as it renders (React's getResource). The
 *              resource elements themselves are commit writers.
 */
export const WRITERS = new Map(
	Object.entries({
		// commit
		applySlotNext: 'commit',
		applyOutgoing: 'commit',
		placeRoots: 'commit',
		placeRun: 'commit',
		commitBag: 'commit',
		commitHTML: 'commit',
		namespaceHead: 'commit',
		drainQueuedControlledSyncs: 'commit',
		placeDeoptChildren: 'commit',
		insertArmPair: 'commit',
		ownTryBodyRange: 'commit',
		placeHydratedText: 'commit',
		removeRange: 'commit',
		clearItems: 'commit',
		moveBlockBefore: 'commit',
		removeNodes: 'commit',
		dropHydrateIdCount: 'commit',
		placeKeptIsland: 'commit',
		commitTextValue: 'commit',
		adoptCheckedness: 'commit',
		placeMarker: 'commit',
		placeAtCommit: 'commit',
		removeOwnedContent: 'commit',
		discardMarker: 'primitive',
		clearRootContainer: 'commit',
		landItemPair: 'commit',
		landHostPair: 'commit',
		placeUpgradedList: 'commit',
		mappedDeoptItemBody: 'commit',
		commitStyleResource: 'commit',
		commitScriptResource: 'commit',
		commitHiddenStyle: 'commit',
		// primitive
		updateTextValue: 'primitive',
		setText: 'primitive',
		setScriptText: 'primitive',
		setHTML: 'primitive',
		setAttribute: 'primitive',
		setPlainAttribute: 'primitive',
		setURLAttribute: 'primitive',
		setStringData: 'primitive',
		setBooleanAttribute: 'primitive',
		setAriaAttribute: 'primitive',
		setClassName: 'primitive',
		setClassAttr: 'primitive',
		setStyleProperty: 'primitive',
		applyStyleValue: 'primitive',
		applyStyleProperty: 'primitive',
		removeHostProp: 'primitive',
		setHeadAttribute: 'primitive',
		applyHeadProps: 'primitive',
		setValue: 'primitive',
		setCheckedState: 'primitive',
		projectSelectValue: 'primitive',
		setDefaultValue: 'primitive',
		setDefaultValueUncontrolled: 'primitive',
		setDefaultChecked: 'primitive',
		mirrorDefaultValue: 'primitive',
		writeControlledValue: 'primitive',
		adoptDefaultValue: 'primitive',
		clearDefaultValue: 'primitive',
		dropAttribute: 'primitive',
		applyFormControlValues: 'primitive',
		markInputCheckedness: 'primitive',
		enforceHiddenDisplay: 'primitive',
		restoreHiddenDisplayValue: 'primitive',
		enforceHiddenText: 'primitive',
		releaseHiddenText: 'primitive',
		insertPrecedenced: 'primitive',
		applyResourceAttrs: 'primitive',
		// fresh
		renderReturnedValue: 'fresh',
		fragmentTemplate: 'fresh',
		parseTemplate: 'fresh',
		drainFrag: 'fresh',
		htext: 'fresh',
		htextSwap: 'fresh',
		bindingText: 'fresh',
		validateDirectSignalControl: 'fresh',
		expectedStyle: 'fresh',
		headBlock: 'fresh',
		prepareFragmentPortalInterleaving: 'commit',
		evacuateInterleavedPortalRanges: 'fresh',
		renderPortalState: 'fresh',
		componentSlotImpl: 'fresh',
		renderFrontierBlock: 'fresh',
		clearChildContent: 'fresh',
		hostComponent: 'fresh',
		renderFragmentRefDescriptor: 'fresh',
		reconcileDeoptChildren: 'fresh',
		deoptItemBody: 'fresh',
		hostElementBody: 'fresh',
		hostStringTagBody: 'fresh',
		replaceHostTagChildren: 'fresh',
		renderPreparedChildList: 'fresh',
		childSlot: 'fresh',
		insertSlotText: 'fresh',
		removeOnlyChildText: 'fresh',
		childTextHole: 'fresh',
		errorBlock: 'fresh',
		tryBlock: 'fresh',
		ownSlotAnchor: 'fresh',
		delimitMarkerlessBranch: 'fresh',
		swapBranchFrontier: 'fresh',
		frontierSentinel: 'fresh',
		releaseFrontierSentinel: 'fresh',
		itemComponentFrontier: 'fresh',
		removeAfter: 'fresh',
		renderBranchSlot: 'fresh',
		activityBlock: 'fresh',
		forBlock: 'fresh',
		mountItem: 'fresh',
		makeRoot: 'fresh',
		createHydrateSlot: 'fresh',
		adoptText: 'fresh',
		stylesheetLink: 'fresh',
		asyncScript: 'fresh',
		// hydration
		clearKeptTextContent: 'hydration',
		discardHydrateTail: 'hydration',
		notifyHydrateBoundary: 'hydration',
		skipFoldedHeadPrefix: 'hydration',
		'HydrationCapability.adoptBindingText': 'hydration',
		'HydrationCapability.newText': 'hydration',
		'HydrationCapability.insertRoot': 'hydration',
		finishInitialSuspenseHydration: 'hydration',
		hydrateRootWithOutputHandler: 'hydration',
		// unmount
		disposeReturnSlot: 'unmount',
		unmountBlockInner: 'unmount',
		// native
		vtInjectScopeStyle: 'native',
		vtSyncScopeMarker: 'commit',
		vtApplyStyles: 'native',
		vtRevertNames: 'native',
		restoreFocusSelection: 'native',
		restoreFocusedMovements: 'native',
		vtFinalizeGroup: 'native',
		clearHmrRange: 'fresh',
		'FragmentInstance.blur': 'native',
		'FragmentInstance.dispatchEvent': 'native',
		'FragmentInstance.scrollIntoView': 'native',
		injectStyle: 'native',
		resetFormNow: 'native',
		handleFormSubmit: 'native',
		restoreControlledElement: 'native',
		restoreCheckedState: 'native',
		restoreRadioCousins: 'native',
		// hint
		preload: 'hint',
		preinit: 'hint',
		preconnect: 'hint',
		prefetchDNS: 'hint',
		preloadModule: 'hint',
		preinitModule: 'hint',
		insertHeadHint: 'hint',
		applyHintAttrs: 'hint',
		preloadStylesheetResource: 'hint',
	}),
);

/**
 * 'fresh' writers that still reach their target through runtime structure
 * without testing for a frontier (#2043), so a root render can write committed
 * DOM through them. check-render-writes fails on a writer missing here and on
 * an entry that no longer needs to be.
 */
export const UNGUARDED_FRESH = new Map(
	Object.entries({
		htext: 'an only-child text hole seeded into its host',
		htextSwap: 'a text hole that replaces its placeholder',
		bindingText: 'a text binding that mints its range',
		evacuateInterleavedPortalRanges: 'a portal into a target that holds other content',
		renderFragmentRefDescriptor: "a ref'd Fragment's marker pair",
		frontierSentinel: 'a spare sentinel renamed before it joins a frontier',
	}),
);
