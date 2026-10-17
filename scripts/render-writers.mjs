/**
 * Every function in the client runtime (packages/octane/src/runtime.ts and
 * runtime/*.ts) that writes native DOM, and
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
		prepareOwnedTemplateScript: 'fresh',
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

/**
 * Individual fresh writes whose safety depends on a runtime invariant outside
 * the checker's bounded branch/provenance model. Keys include the runtime
 * module, writer, operation and receiver expression; the exact count prevents
 * a new identical write from silently borrowing an existing audit. Remove or
 * re-audit an entry when the checker reports it stale.
 */
export const AUDITED_FRESH = new Map(
	Object.entries({
		'block.ts:renderReturnedValue:call:removeChild:domParent.removeChild': [
			1,
			'frontier is non-null only after domParent was redirected to its detached fragment',
		],
		'branches.ts:swapBranchFrontier:call:insertBefore:frag!.insertBefore': [
			2,
			'frag is either the new slot frontier or this transaction’s existing slot fragment',
		],
		'child-slots.ts:childSlot:write:data:end.data': [
			1,
			'end is newly created or the compiler-owned placeholder; freshSlotEnd redirects committed parents',
		],
		'child-slots.ts:childSlot:call:insertBefore:p.insertBefore': [
			2,
			'the preceding adopting and replacing branches stage every active frontier case',
		],
		'child-slots.ts:childSlot:call:insertBefore:parent.insertBefore': [
			1,
			'parent is non-null and the preceding frontier branch did not select parent ?? domParent',
		],
		'child-slots.ts:childSlot:call:insertBefore:state.start.parentNode!.insertBefore': [
			1,
			'the null fragment branch has no applicable frontier; state.start was just placed in that domParent',
		],
		'component-slots.ts:clearHmrRange:call:insertBefore:parent.insertBefore': [
			1,
			'the staged branch schedules the pair at commit when the block has pending writes',
		],
		'component-slots.ts:clearHmrRange:call:replaceChild:parent.replaceChild': [
			1,
			'the staged branch schedules the pair at commit when the block has pending writes',
		],
		'component-slots.ts:clearChildContent:call:removeChild:host.removeChild': [
			1,
			'an active non-aborted, non-rollback transaction with a parent queues deletion and returns',
		],
		'component-slots.ts:clearChildContent:call:removeChild:parent.removeChild': [
			1,
			'an active non-aborted, non-rollback transaction with a parent queues deletion and returns',
		],
		'component-slots.ts:clearChildContent:call:remove:state.text.remove': [
			1,
			'an active non-aborted, non-rollback transaction with a parent queues deletion and returns',
		],
		'component-slots.ts:clearChildContent:call:removeChild:state.hostNode.parentNode!.removeChild':
			[
				1,
				'an active non-aborted, non-rollback transaction with a parent queues deletion and returns',
			],
		'deopt.ts:deoptItemBody:call:replaceChild:host.replaceChild': [
			1,
			'host is a distinct, unlanded frontier marked by $$next',
		],
		'deopt.ts:deoptItemBody:call:removeChild:host.removeChild': [
			1,
			'host is a distinct, unlanded frontier marked by $$next',
		],
		'deopt.ts:deoptItemBody:call:insertBefore:parent.insertBefore': [
			1,
			'the immediately preceding frontier test for this parent selects the detached branch instead',
		],
		'deopt.ts:hostElementBody:call:insertBefore:parent.insertBefore': [
			1,
			'the frontier branch handles replacement; an initial host builds in its new block',
		],
		'deopt.ts:hostStringTagBody:call:insertBefore:parent.insertBefore': [
			1,
			'first mount uses the component slot’s insertion context; committed-parent mounts are redirected to a frontier',
		],
		'engine.ts:makeRoot:call:append:frontier.frag!.append': [
			1,
			'queueFrontier created the off-document root fragment',
		],
		'head.ts:headBlock:call:appendChild:ownerDocument.head.appendChild': [
			1,
			'runs from the transaction commit callback',
		],
		'head.ts:headBlock:call:appendChild:head.appendChild': [
			1,
			'the active, non-aborted transaction branch queues the insertion instead',
		],
		'head.ts:headBlock:call:remove:state!.el.remove': [1, 'runs from the scope unmount cleanup'],
		'hydrate-boundary.ts:createHydrateSlot:call:setAttribute:wrapper.setAttribute': [
			3,
			'serverPreserved is false; the client wrapper has not been placed',
		],
		'hydrate-boundary.ts:createHydrateSlot:call:append:wrapper.append': [
			1,
			'a preserved server wrapper without its range fails hydration before this write',
		],
		'lists.ts:forBlock:write:data:end.data': [
			1,
			'ownEnd identifies the compiler-owned placeholder; freshSlotEnd redirects a committed parent',
		],
	}),
);

/** Known exact-site debt, distinct from audited-safe writes and the legacy writer-wide list. */
export const UNRESOLVED_FRESH = new Map([
	[
		'deopt.ts:deoptItemBody:call:removeChild:parent.removeChild',
		[
			1,
			'failed same-tag transfer fallback: active-cursor reachability is unproven; deferring removal could make hydration adopt a node queued for deletion',
		],
	],
]);
