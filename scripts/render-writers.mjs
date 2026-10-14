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
 *   rollback   The transition journal restoring what a dropped render changed.
 *   unmount    Removes an unmounting tree outside a root render.
 *   native     Outside rendering: imperative handles, form and focus
 *              plumbing, ViewTransition naming in the native update, head and
 *              resource hints, style injection, hot reload.
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
		clearRootContainer: 'commit',
		landItemPair: 'commit',
		landHostPair: 'commit',
		mappedDeoptItemBody: 'commit',
		// primitive
		updateTextValue: 'primitive',
		setText: 'primitive',
		resetOnlyChildHost: 'primitive',
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
		setFormAction: 'primitive',
		setValue: 'primitive',
		setCheckedState: 'primitive',
		projectSelectValue: 'primitive',
		setDefaultValue: 'primitive',
		setDefaultValueUncontrolled: 'primitive',
		setDefaultChecked: 'primitive',
		applyFormControlValues: 'primitive',
		markInputCheckedness: 'primitive',
		enforceHiddenDisplay: 'primitive',
		restoreHiddenDisplayValue: 'primitive',
		writeHiddenStyle: 'primitive',
		enforceHiddenText: 'primitive',
		releaseHiddenText: 'primitive',
		// fresh
		renderReturnedValue: 'fresh',
		fragmentTemplate: 'fresh',
		parseTemplate: 'fresh',
		clone: 'fresh',
		drainFrag: 'fresh',
		htext: 'fresh',
		htextSwap: 'fresh',
		bindingText: 'fresh',
		validateDirectSignalControl: 'fresh',
		expectedStyle: 'fresh',
		headBlock: 'fresh',
		prepareFragmentPortalInterleaving: 'fresh',
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
		mountItemsLinear: 'fresh',
		mountItem: 'fresh',
		makeRoot: 'fresh',
		createHydrateSlot: 'fresh',
		'HydrationCapability.adoptText': 'fresh',
		// hydration
		clearKeptTextContent: 'hydration',
		discardHydrateTail: 'hydration',
		notifyHydrateBoundary: 'hydration',
		skipFoldedHeadPrefix: 'hydration',
		'HydrationCapability.adoptBindingText': 'hydration',
		'HydrationCapability.newText': 'hydration',
		'HydrationCapability.wrapUnframedRoot': 'hydration',
		'HydrationCapability.insertRoot': 'hydration',
		finishInitialSuspenseHydration: 'hydration',
		mountPassthroughListItem: 'hydration',
		removePassthroughItemRange: 'hydration',
		hydrateRootWithOutputHandler: 'hydration',
		// rollback
		restoreRootRange: 'rollback',
		restoreRootNodes: 'rollback',
		rollbackTransitionJournal: 'rollback',
		// unmount
		disposeReturnSlot: 'unmount',
		unmountBlockInner: 'unmount',
		// native
		vtInjectScopeStyle: 'native',
		vtReleaseScopeBoundary: 'native',
		vtPrepareScopeBoundary: 'native',
		vtApplyStyles: 'native',
		vtRevertNames: 'native',
		restoreFocusSelection: 'native',
		restoreFocusedMovements: 'native',
		vtFinalizeGroup: 'native',
		promoteHmrBlockRange: 'native',
		'FragmentInstance.blur': 'native',
		'FragmentInstance.dispatchEvent': 'native',
		'FragmentInstance.scrollIntoView': 'native',
		injectStyle: 'native',
		resetFormNow: 'native',
		handleFormSubmit: 'native',
		restoreControlledElement: 'native',
		restoreCheckedState: 'native',
		restoreRadioCousins: 'native',
		insertHeadHint: 'native',
		applyHintAttrs: 'native',
		preload: 'native',
		preconnect: 'native',
		prefetchDNS: 'native',
		preloadModule: 'native',
		preinitModule: 'native',
		insertPrecedenced: 'native',
		applyResourceAttrs: 'native',
		stylesheetResource: 'native',
		styleResource: 'native',
		scriptResource: 'native',
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
		clone: 'a template clone, and a hole that replaces its adopted node',
		htext: 'an only-child text hole seeded into its host',
		htextSwap: 'a text hole that replaces its placeholder',
		bindingText: 'a text binding that mints its range',
		prepareFragmentPortalInterleaving: 'a portal into a target that holds other content',
		evacuateInterleavedPortalRanges: 'a portal into a target that holds other content',
		renderFragmentRefDescriptor: "a ref'd Fragment's marker pair",
		hostStringTagBody: 'a string-tag host built into its Block',
		frontierSentinel: 'a spare sentinel renamed before it joins a frontier',
	}),
);
